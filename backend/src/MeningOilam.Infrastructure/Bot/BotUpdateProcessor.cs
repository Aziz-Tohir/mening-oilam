using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using MeningOilam.Application.Abstractions;
using MeningOilam.Application.Common;
using MeningOilam.Application.Kinship;
using MeningOilam.Domain.Entities;
using MeningOilam.Domain.Enums;
using MeningOilam.Infrastructure.Caching;
using MeningOilam.Infrastructure.Configuration;
using MeningOilam.Infrastructure.Data;
using MeningOilam.Infrastructure.Media;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace MeningOilam.Infrastructure.Bot;

/// <summary>Core Telegram update dispatcher — port of telegramHandlers.server.ts (main flows).</summary>
public class BotUpdateProcessor(
    AppDbContext db,
    ITelegramService tg,
    Telegram.TelegramClient client,
    BotCache cache,
    BotSessionStore sessions,
    ModerationService moderation,
    ILocalizer loc,
    IVideoDownloader videoDownloader,
    VideoDownloadQueue videoQueue,
    IOptions<TelegramOptions> tgOptions,
    ILogger<BotUpdateProcessor> log)
{
    private readonly TelegramOptions _tg = tgOptions.Value;

    public async Task ProcessAsync(JsonElement update, CancellationToken ct = default)
    {
        try
        {
            if (update.Prop("callback_query") is { } cb) { await HandleCallbackAsync(cb, ct); return; }
            if (update.Prop("message") is { } msg) { await HandleMessageAsync(msg, ct); return; }
            if (update.Prop("my_chat_member") is { } mcm) { await HandleMyChatMemberAsync(mcm, ct); return; }
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Update processing failed");
            throw;
        }
    }

    // =================== MESSAGES ===================
    private async Task HandleMessageAsync(JsonElement msg, CancellationToken ct)
    {
        var chat = msg.Prop("chat");
        var chatType = chat?.Prop("type").Str();
        var chatId = chat?.Prop("id").Long() ?? 0;
        var from = msg.Prop("from");
        var userId = from?.Prop("id").Long() ?? 0;
        if (userId == 0) return;

        if (chatType == "private") await HandlePrivateMessageAsync(msg, chatId, userId, from!.Value, ct);
        else await HandleGroupMessageAsync(msg, chatId, userId, from!.Value, ct);
    }

    private async Task HandlePrivateMessageAsync(JsonElement msg, long chatId, long userId, JsonElement from, CancellationToken ct)
    {
        var text = msg.Prop("text").Str()?.Trim();
        var lang = await GetLangAsync(userId, ct);

        // Photo → avatar flow
        if (msg.Prop("photo") is { ValueKind: JsonValueKind.Array } photos && photos.GetArrayLength() > 0)
        {
            var fileId = photos[photos.GetArrayLength() - 1].Prop("file_id").Str();
            if (fileId is not null && await db.FamilyMembers.AnyAsync(m => m.TelegramId == userId && m.Status == MemberStatus.Active, ct))
            {
                var pending = new PendingAvatarUpload { TelegramId = userId, FileId = fileId };
                db.PendingAvatarUploads.Add(pending);
                await db.SaveChangesAsync(ct);
                await tg.SendMessageAsync(chatId, "🖼 Bu rasmni profil rasmi qilaymi?",
                    new[] { new[] { new TgButton("✅ Ha", $"avok:{pending.Id}"), new TgButton("❌ Yo'q", $"avno:{pending.Id}") } }, ct: ct);
            }
            return;
        }

        // Contact → join relative
        if (msg.Prop("contact") is { } contact)
        {
            await HandleRelativeContactAsync(chatId, userId, contact, ct);
            return;
        }

        if (text is null) return;

        // Deep link: /start fam_<CODE>
        if (text.StartsWith("/start"))
        {
            var parts = text.Split(' ', 2);
            if (parts.Length == 2 && parts[1].StartsWith("fam_"))
            {
                await StartJoinByCodeAsync(chatId, userId, parts[1][4..], from, ct);
                return;
            }
            await SendStartAsync(chatId, userId, lang, ct);
            return;
        }

        if (text is "/help" or "/info") { await tg.SendMessageAsync(chatId, BuildHelp(lang), ct: ct); return; }
        if (text is "/reset" or "/logout") { await sessions.ClearAsync(userId, ct); await tg.SendMessageAsync(chatId, "✅ Sessiya tozalandi. /start bosing.", ct: ct); return; }
        if (text is "/kim") { await StartKinshipAsync(chatId, userId, ct); return; }
        if (text is "/privacy" or "/maxfiylik") { await SendPrivacyMenuAsync(chatId, userId, ct); return; }
        if (text.StartsWith("/yordam")) { await HandleHelpRequestAsync(chatId, userId, text.Length > 7 ? text[7..].Trim() : "", ct); return; }

        // Wizard input (family name)
        var session = await sessions.GetAsync(userId, ct);
        if (session?.step == "newfam_name")
        {
            await CreateFamilyByNameAsync(chatId, userId, text, from, lang, ct);
            return;
        }

        // Relative username typed during join
        if (await db.JoinRequests.AnyAsync(j => j.ApplicantTelegramId == userId && j.Status == JoinRequestStatus.AwaitingRelativeChoice, ct))
        {
            await HandleRelativeUsernameAsync(chatId, userId, text.TrimStart('@'), ct);
            return;
        }

        await SendStartAsync(chatId, userId, lang, ct);
    }

    private async Task HandleGroupMessageAsync(JsonElement msg, long chatId, long userId, JsonElement from, CancellationToken ct)
    {
        // /link <CODE>
        var text = msg.Prop("text").Str();
        if (text is not null && text.StartsWith("/link"))
        {
            await HandleLinkCommandAsync(msg, chatId, userId, text, ct);
            return;
        }

        var family = await cache.GetFamilyByChatIdAsync(chatId, ct);
        if (family is null) return;

        // New / left member service messages
        if (msg.Prop("left_chat_member") is { } left)
        {
            var leftId = left.Prop("id").Long();
            if (leftId == userId)
            {
                var m = await db.FamilyMembers.FirstOrDefaultAsync(x => x.FamilyId == family.Id && x.TelegramId == userId, ct);
                if (m is not null) { m.Status = MemberStatus.Pending; await db.SaveChangesAsync(ct); }
            }
            await MaybeDeleteServiceMessageAsync(family.Id, chatId, msg, ct);
            return;
        }
        if (msg.Prop("new_chat_members") is not null)
        {
            await MaybeDeleteServiceMessageAsync(family.Id, chatId, msg, ct);
            return;
        }

        if (from.Prop("is_bot").Bool()) return; // ignore other bots here (foreign-bot handling simplified)

        var messageId = msg.Prop("message_id").Int() ?? 0;
        var isForward = msg.Prop("forward_origin") is not null || msg.Prop("forward_from") is not null ||
                        msg.Prop("forward_from_chat") is not null || msg.Prop("sender_chat") is not null;
        var bodyText = text ?? msg.Prop("caption").Str();

        // Moderation
        var outcome = await moderation.ModerateAsync(family.Id, chatId, userId, messageId, bodyText, isForward, ct);
        if (outcome.Deleted) return;

        // Clean video relay: if the message contains a supported media link, queue a download.
        await MaybeQueueVideoDownloadAsync(family.Id, chatId, userId, messageId, msg, bodyText, ct);

        // Message stats + sentiment buffer
        await TrackMessageAsync(family.Id, userId, bodyText, ct);

        // Memories auto-save
        await SaveMemoryIfMediaAsync(family.Id, chatId, userId, msg, ct);
    }

    // =================== CALLBACKS ===================
    private async Task HandleCallbackAsync(JsonElement cb, CancellationToken ct)
    {
        var id = cb.Prop("id").Str() ?? "";
        var data = cb.Prop("data").Str() ?? "";
        var from = cb.Prop("from");
        var userId = from?.Prop("id").Long() ?? 0;
        var msg = cb.Prop("message");
        var chatId = msg?.Path("chat", "id").Long() ?? 0;
        var messageId = msg?.Prop("message_id").Int() ?? 0;
        var lang = await GetLangAsync(userId, ct);

        async Task Ack(string? t = null) => await client.CallAsync("answerCallbackQuery", new { callback_query_id = id, text = t });

        if (data.StartsWith("lang:"))
        {
            var l = data[5..];
            await SetLangAsync(userId, l, ct);
            await Ack(loc.T("lang_set", l));
            await SendStartAsync(chatId, userId, l, ct);
        }
        else if (data == "wiz:newfam")
        {
            await sessions.SetAsync(userId, "newfam_name", null, ct);
            await Ack();
            await tg.SendMessageAsync(chatId, loc.T("create_ask_name", lang), ct: ct);
        }
        else if (data == "wiz:joinfam")
        {
            await Ack();
            await SendJoinFamilyPickerAsync(chatId, userId, lang, ct);
        }
        else if (data.StartsWith("pickfam:"))
        {
            await Ack();
            await StartJoinForFamilyAsync(chatId, userId, Guid.Parse(data[8..]), from!.Value, ct);
        }
        else if (data.StartsWith("rel:"))
        {
            var rest = data[4..].Split(':', 2);
            await SetJoinRelationshipAsync(chatId, messageId, Guid.Parse(rest[0]), rest[1], ct);
            await Ack("✅");
        }
        else if (data.StartsWith("relno:"))
        {
            await RejectJoinAsync(Guid.Parse(data[6..]), "Tasdiqlovchi tanimadi", ct);
            await Ack("❌");
        }
        else if (data.StartsWith("approve:"))
        {
            await ApproveJoinAsync(chatId, messageId, userId, Guid.Parse(data[8..]), ct);
            await Ack("✅");
        }
        else if (data.StartsWith("reject:"))
        {
            await RejectJoinAsync(Guid.Parse(data[7..]), "Admin rad etdi", ct);
            await Ack("❌");
        }
        else if (data.StartsWith("kim:"))
        {
            await HandleKinshipCallbackAsync(chatId, messageId, userId, data[4..], ct);
            await Ack();
        }
        else if (data.StartsWith("priv:"))
        {
            var rest = data[5..].Split(':');
            var m = await db.FamilyMembers.FirstOrDefaultAsync(x => x.Id == Guid.Parse(rest[0]), ct);
            if (m is not null) { m.SentimentOptOut = rest[1] == "1"; await db.SaveChangesAsync(ct); }
            await Ack("✅");
            await SendPrivacyMenuAsync(chatId, userId, ct);
        }
        else if (data.StartsWith("bday:"))
        {
            await HandleBirthdayGreetingAsync(chatId, userId, from!.Value, Guid.Parse(data[5..]), ct);
            await Ack("🎂");
        }
        else if (data.StartsWith("avok:") || data.StartsWith("avno:"))
        {
            await HandleAvatarConfirmAsync(chatId, userId, data, ct);
            await Ack();
        }
        else await Ack();
    }

    // =================== MY CHAT MEMBER (group link) ===================
    private async Task HandleMyChatMemberAsync(JsonElement mcm, CancellationToken ct)
    {
        var chat = mcm.Prop("chat");
        var chatId = chat?.Prop("id").Long() ?? 0;
        var title = chat?.Prop("title").Str();
        var status = mcm.Path("new_chat_member", "status").Str();
        var adderId = mcm.Path("from", "id").Long() ?? 0;
        if (status is not ("administrator" or "member")) return;

        if (await db.Families.AnyAsync(f => f.TelegramGroupId == chatId, ct)) return;

        var session = await sessions.GetAsync(adderId, ct);
        if (session?.step == "pending_group_link" && session.Value.data.TryGetProperty("family_id", out var fidEl)
            && Guid.TryParse(fidEl.GetString(), out var familyId))
        {
            var family = await db.Families.FirstOrDefaultAsync(f => f.Id == familyId, ct);
            if (family is not null)
            {
                family.TelegramGroupId = chatId;
                family.TelegramGroupTitle = title;
                if (!await db.FamilySettings.AnyAsync(s => s.FamilyId == familyId, ct))
                    db.FamilySettings.Add(new FamilySettings { FamilyId = familyId });
                await db.SaveChangesAsync(ct);
                await sessions.ClearAsync(adderId, ct);
                await tg.SendMessageAsync(chatId, $"✅ Guruh <b>{family.Name}</b> oilasiga ulandi. Iltimos meni admin qiling.", ct: ct);
                return;
            }
        }
        await tg.SendMessageAsync(chatId, "👋 Salom! Bu guruh hali oilaga bog'lanmagan. Oila admini /link &lt;TAKLIF_KODI&gt; yuborsin.", ct: ct);
    }

    // =================== START / LANGUAGE ===================
    private async Task SendStartAsync(long chatId, long userId, string lang, CancellationToken ct)
    {
        var profile = await db.Profiles.FirstOrDefaultAsync(p => p.TelegramId == userId, ct);
        if (profile?.Language is null)
        {
            await tg.SendMessageAsync(chatId, loc.T("choose_lang", lang), new[]
            {
                new[] { new TgButton("🇺🇿 O'zbekcha", "lang:uz"), new TgButton("🇺🇿 Ўзбекча", "lang:uz_cyrl") },
                new[] { new TgButton("🇷🇺 Русский", "lang:ru"), new TgButton("🇬🇧 English", "lang:en") },
            }, ct: ct);
            return;
        }

        var activeMemberships = await db.FamilyMembers.AsNoTracking()
            .Where(m => m.TelegramId == userId && m.Status == MemberStatus.Active)
            .Join(db.Families, m => m.FamilyId, f => f.Id, (m, f) => f.Name).ToListAsync(ct);

        var buttons = new List<List<TgButton>>
        {
            new() { new TgButton(loc.T("btn_create_family", lang), "wiz:newfam") },
            new() { new TgButton(loc.T("btn_join_family", lang), "wiz:joinfam") },
            new() { new TgButton(loc.T("btn_open_app", lang), null, null, _tg.MiniAppUrl) },
        };
        var greeting = activeMemberships.Count > 0
            ? loc.T("already_member", lang, new Dictionary<string, string> { ["names"] = string.Join(", ", activeMemberships) })
            : loc.T("welcome", lang);
        await tg.SendMessageAsync(chatId, $"{greeting}\n\n{loc.T("start_choose_action", lang)}", buttons.Select(r => (IReadOnlyList<TgButton>)r).ToList(), ct: ct);
    }

    private async Task SetLangAsync(long userId, string lang, CancellationToken ct)
    {
        var profile = await db.Profiles.FirstOrDefaultAsync(p => p.TelegramId == userId, ct);
        if (profile is null)
        {
            var user = new AppUser { Email = $"tg{userId}@telegram.local", EmailConfirmed = true };
            db.Users.Add(user);
            db.Profiles.Add(new Profile { UserId = user.Id, TelegramId = userId, Language = lang, Email = user.Email });
        }
        else profile.Language = lang;
        await db.SaveChangesAsync(ct);
    }

    private async Task<string> GetLangAsync(long userId, CancellationToken ct)
    {
        var lang = await db.Profiles.AsNoTracking().Where(p => p.TelegramId == userId).Select(p => p.Language).FirstOrDefaultAsync(ct);
        return lang ?? "uz";
    }

    // =================== FAMILY CREATE / JOIN ===================
    private async Task CreateFamilyByNameAsync(long chatId, long userId, string name, JsonElement from, string lang, CancellationToken ct)
    {
        if (name.Length is < 2 or > 100) { await tg.SendMessageAsync(chatId, loc.T("create_ask_name", lang), ct: ct); return; }
        var (user, _) = await EnsureUserAsync(userId, from, ct);
        var family = new Family { Name = name, OwnerUserId = user.Id, InviteCode = GenerateInviteCode() };
        db.Families.Add(family);
        db.FamilySettings.Add(new FamilySettings { FamilyId = family.Id });
        db.UserRoles.Add(new UserRole { UserId = user.Id, FamilyId = family.Id, Role = AppRole.Admin });
        db.FamilyMembers.Add(new FamilyMember { FamilyId = family.Id, TelegramId = userId, FullName = DisplayName(from), Status = MemberStatus.Active, UserId = user.Id });
        await db.SaveChangesAsync(ct);

        await sessions.SetAsync(userId, "pending_group_link", new { family_id = family.Id, invite_code = family.InviteCode }, ct);
        await tg.SendMessageAsync(chatId, loc.T("create_done", lang, new Dictionary<string, string> { ["name"] = name }), ct: ct);
        await tg.SendMessageAsync(chatId, loc.T("create_group_steps", lang), new[]
        {
            new[] { new TgButton(loc.T("btn_add_to_group", lang), null, $"https://t.me/{_tg.BotUsername}?startgroup=true") },
        }, ct: ct);
    }

    private async Task SendJoinFamilyPickerAsync(long chatId, long userId, string lang, CancellationToken ct)
    {
        var families = await db.Families.AsNoTracking().Where(f => f.TelegramGroupId != null)
            .OrderBy(f => f.Name).Take(20).Select(f => new { f.Id, f.Name }).ToListAsync(ct);
        if (families.Count == 0) { await tg.SendMessageAsync(chatId, loc.T("no_families", lang), ct: ct); return; }
        var buttons = families.Select(f => (IReadOnlyList<TgButton>)new List<TgButton> { new(f.Name, $"pickfam:{f.Id}") }).ToList();
        await tg.SendMessageAsync(chatId, loc.T("start_choose_action", lang), buttons, ct: ct);
    }

    private async Task StartJoinByCodeAsync(long chatId, long userId, string code, JsonElement from, CancellationToken ct)
    {
        var family = await db.Families.AsNoTracking().FirstOrDefaultAsync(f => f.InviteCode == code.ToUpperInvariant(), ct);
        if (family is null) { await tg.SendMessageAsync(chatId, loc.T("deep_link_invalid"), ct: ct); return; }
        await StartJoinForFamilyAsync(chatId, userId, family.Id, from, ct);
    }

    private async Task StartJoinForFamilyAsync(long chatId, long userId, Guid familyId, JsonElement from, CancellationToken ct)
    {
        if (await db.FamilyMembers.AnyAsync(m => m.FamilyId == familyId && m.TelegramId == userId && m.Status == MemberStatus.Active, ct))
        { await tg.SendMessageAsync(chatId, "✅ Siz allaqachon bu oila a'zosisiz.", ct: ct); return; }

        var existing = await db.JoinRequests.FirstOrDefaultAsync(j => j.FamilyId == familyId && j.ApplicantTelegramId == userId &&
            j.Status == JoinRequestStatus.AwaitingRelativeChoice, ct);
        if (existing is null)
        {
            db.JoinRequests.Add(new JoinRequest
            {
                FamilyId = familyId, ApplicantTelegramId = userId, ApplicantUsername = from.Prop("username").Str(),
                ApplicantFullName = DisplayName(from), Status = JoinRequestStatus.AwaitingRelativeChoice,
            });
            await db.SaveChangesAsync(ct);
        }
        await tg.SendMessageAsync(chatId, "👨‍👩‍👧 Oilada sizga qarindosh bo'lgan a'zoning <b>@username</b>ini yozing yoki kontaktini ulashing.", ct: ct);
    }

    private async Task HandleRelativeUsernameAsync(long chatId, long userId, string username, CancellationToken ct)
    {
        var req = await db.JoinRequests.FirstOrDefaultAsync(j => j.ApplicantTelegramId == userId && j.Status == JoinRequestStatus.AwaitingRelativeChoice, ct);
        if (req is null) return;
        var relative = await db.FamilyMembers.FirstOrDefaultAsync(m => m.FamilyId == req.FamilyId && m.Username == username && m.Status == MemberStatus.Active, ct);
        if (relative is null) { await tg.SendMessageAsync(chatId, "Bu qarindosh topilmadi. Qaytadan urinib ko'ring.", ct: ct); return; }
        req.RelativeMemberId = relative.Id;
        req.Status = JoinRequestStatus.AwaitingAdminApproval;
        await db.SaveChangesAsync(ct);
        await NotifyAdminsForApprovalAsync(req, ct);
        await tg.SendMessageAsync(chatId, "✅ Rahmat! So'rovingiz adminlarga yuborildi.", ct: ct);
    }

    private async Task HandleRelativeContactAsync(long chatId, long userId, JsonElement contact, CancellationToken ct)
    {
        var contactUserId = contact.Prop("user_id").Long();
        var req = await db.JoinRequests.FirstOrDefaultAsync(j => j.ApplicantTelegramId == userId && j.Status == JoinRequestStatus.AwaitingRelativeChoice, ct);
        if (req is null || contactUserId is null) return;
        var relative = await db.FamilyMembers.FirstOrDefaultAsync(m => m.FamilyId == req.FamilyId && m.TelegramId == contactUserId, ct);
        if (relative is null) { await tg.SendMessageAsync(chatId, "Bu qarindosh oila a'zolari ro'yxatida topilmadi.", ct: ct); return; }
        req.RelativeMemberId = relative.Id;
        req.Status = JoinRequestStatus.AwaitingAdminApproval;
        await db.SaveChangesAsync(ct);
        await NotifyAdminsForApprovalAsync(req, ct);
        await tg.SendMessageAsync(chatId, "✅ Rahmat! So'rovingiz adminlarga yuborildi.", ct: ct);
    }

    private async Task SetJoinRelationshipAsync(long chatId, int messageId, Guid reqId, string relType, CancellationToken ct)
    {
        var req = await db.JoinRequests.FirstOrDefaultAsync(j => j.Id == reqId, ct);
        if (req is null) return;
        if (Enum.TryParse<RelationshipType>(SnakeToPascal(relType), true, out var t)) req.RelationshipType = t;
        req.Status = JoinRequestStatus.AwaitingAdminApproval;
        await db.SaveChangesAsync(ct);
        await NotifyAdminsForApprovalAsync(req, ct);
    }

    private async Task NotifyAdminsForApprovalAsync(JoinRequest req, CancellationToken ct)
    {
        var admins = await db.UserRoles.AsNoTracking()
            .Where(r => r.FamilyId == req.FamilyId && (r.Role == AppRole.Admin || r.Role == AppRole.Superadmin))
            .Join(db.Profiles, r => r.UserId, p => p.UserId, (r, p) => p.TelegramId)
            .Where(tid => tid != null).Select(tid => tid!.Value).Distinct().ToListAsync(ct);
        var text = $"🆕 Yangi a'zo so'rovi: <b>{req.ApplicantFullName}</b>";
        foreach (var adminTg in admins)
            await tg.SendMessageAsync(adminTg, text, new[]
            {
                new[] { new TgButton("✅ Tasdiqlash", $"approve:{req.Id}"), new TgButton("❌ Rad etish", $"reject:{req.Id}") },
            }, ct: ct);
    }

    private async Task ApproveJoinAsync(long chatId, int messageId, long adminUserId, Guid reqId, CancellationToken ct)
    {
        var req = await db.JoinRequests.FirstOrDefaultAsync(j => j.Id == reqId, ct);
        if (req is null || req.Status == JoinRequestStatus.Approved) return;
        var family = await db.Families.FirstOrDefaultAsync(f => f.Id == req.FamilyId, ct);
        if (family is null) return;

        var member = await db.FamilyMembers.FirstOrDefaultAsync(m => m.FamilyId == req.FamilyId && m.TelegramId == req.ApplicantTelegramId, ct);
        if (member is null)
        {
            member = new FamilyMember { FamilyId = req.FamilyId, TelegramId = req.ApplicantTelegramId, Username = req.ApplicantUsername, FullName = req.ApplicantFullName ?? "A'zo", Status = MemberStatus.Active };
            db.FamilyMembers.Add(member);
        }
        else member.Status = MemberStatus.Active;

        req.Status = JoinRequestStatus.Approved;
        req.DecidedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        // relationship link
        if (req.RelativeMemberId is not null && req.RelationshipType is not null)
            db.Relationships.Add(new Relationship { FamilyId = req.FamilyId, MemberId1 = req.RelativeMemberId.Value, MemberId2 = member.Id, RelationshipType = req.RelationshipType.Value });
        await db.SaveChangesAsync(ct);

        await client.CallAsync("editMessageText", new { chat_id = chatId, message_id = messageId, text = "✅ Tasdiqlandi" }, ct);
        if (family.TelegramGroupId is not null)
        {
            var link = await tg.CreateInviteLinkAsync(family.TelegramGroupId.Value, 1, ct);
            if (link is not null) await tg.SendMessageAsync(req.ApplicantTelegramId, $"✅ So'rovingiz tasdiqlandi! Guruhga qo'shiling:\n{link}", ct: ct);
            await tg.SendMessageAsync(family.TelegramGroupId.Value, $"🌳 Oilamizga yangi a'zo qo'shildi: <b>{member.FullName}</b>", ct: ct);
        }
    }

    private async Task RejectJoinAsync(Guid reqId, string reason, CancellationToken ct)
    {
        var req = await db.JoinRequests.FirstOrDefaultAsync(j => j.Id == reqId, ct);
        if (req is null) return;
        req.Status = JoinRequestStatus.Rejected;
        req.RejectReason = reason;
        req.DecidedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        await tg.SendMessageAsync(req.ApplicantTelegramId, $"❌ So'rovingiz rad etildi. ({reason})", ct: ct);
    }

    // =================== KINSHIP ===================
    private async Task StartKinshipAsync(long chatId, long userId, CancellationToken ct)
    {
        var families = await db.FamilyMembers.AsNoTracking().Where(m => m.TelegramId == userId && m.Status == MemberStatus.Active)
            .Join(db.Families, m => m.FamilyId, f => f.Id, (m, f) => new { f.Id, f.Name }).Distinct().ToListAsync(ct);
        if (families.Count == 0) { await tg.SendMessageAsync(chatId, "Siz hech qaysi oilada faol a'zo emassiz.", ct: ct); return; }
        var buttons = families.Select(f => (IReadOnlyList<TgButton>)new List<TgButton> { new(f.Name, $"kim:f:{f.Id}") }).ToList();
        await tg.SendMessageAsync(chatId, "🌳 Qaysi oila bo'yicha hisoblaymiz?", buttons, ct: ct);
    }

    private async Task HandleKinshipCallbackAsync(long chatId, int messageId, long userId, string data, CancellationToken ct)
    {
        if (data.StartsWith("f:"))
        {
            var fid = Guid.Parse(data[2..]);
            await UpsertKinshipSessionAsync(userId, fid, null, ct);
            await SendKinshipMemberPickerAsync(chatId, messageId, fid, "1", 0, ct);
        }
        else if (data.StartsWith("1:"))
        {
            var mid = Guid.Parse(data[2..]);
            var sess = await db.KinshipSessions.FirstOrDefaultAsync(k => k.UserTelegramId == userId, ct);
            if (sess is null) return;
            sess.FirstMemberId = mid; await db.SaveChangesAsync(ct);
            await SendKinshipMemberPickerAsync(chatId, messageId, sess.FamilyId!.Value, "2", 0, ct);
        }
        else if (data.StartsWith("2:"))
        {
            var toId = Guid.Parse(data[2..]);
            var sess = await db.KinshipSessions.FirstOrDefaultAsync(k => k.UserTelegramId == userId, ct);
            if (sess?.FamilyId is null || sess.FirstMemberId is null) return;
            await ReplyKinshipAsync(chatId, sess.FamilyId.Value, sess.FirstMemberId.Value, toId, ct);
        }
        else if (data.StartsWith("n:"))
        {
            var parts = data[2..].Split(':');
            var sess = await db.KinshipSessions.AsNoTracking().FirstOrDefaultAsync(k => k.UserTelegramId == userId, ct);
            if (sess?.FamilyId is not null) await SendKinshipMemberPickerAsync(chatId, messageId, sess.FamilyId.Value, parts[0], int.Parse(parts[1]), ct);
        }
    }

    private async Task ReplyKinshipAsync(long chatId, Guid familyId, Guid fromId, Guid toId, CancellationToken ct)
    {
        var edges = await db.Relationships.AsNoTracking().Where(r => r.FamilyId == familyId)
            .Select(r => new { r.MemberId1, r.MemberId2, r.RelationshipType }).ToListAsync(ct);
        var rows = edges.Select(e => new EdgeRow(e.MemberId1, e.MemberId2, Naming.ToSnake(e.RelationshipType))).ToList();
        var result = KinshipCalculator.Calculate(rows, fromId, toId);
        var names = await db.FamilyMembers.AsNoTracking().Where(m => m.Id == fromId || m.Id == toId).ToDictionaryAsync(m => m.Id, m => m.FullName, ct);
        await tg.SendMessageAsync(chatId, $"🌳 <b>{names.GetValueOrDefault(toId, "?")}</b> — <b>{names.GetValueOrDefault(fromId, "?")}</b>ga <b>{result.Label}</b> bo'ladi.", ct: ct);
    }

    private async Task SendKinshipMemberPickerAsync(long chatId, int messageId, Guid familyId, string which, int page, CancellationToken ct)
    {
        const int pageSize = 8;
        var members = await db.FamilyMembers.AsNoTracking().Where(m => m.FamilyId == familyId && m.Status == MemberStatus.Active)
            .OrderBy(m => m.FullName).Select(m => new { m.Id, m.FullName }).ToListAsync(ct);
        var pageItems = members.Skip(page * pageSize).Take(pageSize).ToList();
        var rows = pageItems.Select(m => (IReadOnlyList<TgButton>)new List<TgButton> { new(m.FullName, $"kim:{which}:{m.Id}") }).ToList();
        var nav = new List<TgButton>();
        if (page > 0) nav.Add(new TgButton("◀", $"kim:n:{which}:{page - 1}"));
        if ((page + 1) * pageSize < members.Count) nav.Add(new TgButton("▶", $"kim:n:{which}:{page + 1}"));
        if (nav.Count > 0) rows.Add(nav);
        var prompt = which == "1" ? "Kimdan? (1-shaxs)" : "Kimgacha? (2-shaxs)";
        await tg.SendMessageAsync(chatId, prompt, rows, ct: ct);
    }

    private async Task UpsertKinshipSessionAsync(long userId, Guid familyId, Guid? first, CancellationToken ct)
    {
        var sess = await db.KinshipSessions.FirstOrDefaultAsync(k => k.UserTelegramId == userId, ct);
        if (sess is null) db.KinshipSessions.Add(new KinshipSession { UserTelegramId = userId, FamilyId = familyId, FirstMemberId = first });
        else { sess.FamilyId = familyId; sess.FirstMemberId = first; sess.UpdatedAt = DateTimeOffset.UtcNow; }
        await db.SaveChangesAsync(ct);
    }

    // =================== MISC ===================
    private async Task SendPrivacyMenuAsync(long chatId, long userId, CancellationToken ct)
    {
        var members = await db.FamilyMembers.AsNoTracking().Where(m => m.TelegramId == userId && m.Status == MemberStatus.Active)
            .Join(db.Families, m => m.FamilyId, f => f.Id, (m, f) => new { m.Id, f.Name, m.SentimentOptOut }).ToListAsync(ct);
        if (members.Count == 0) { await tg.SendMessageAsync(chatId, "Faol a'zolik topilmadi.", ct: ct); return; }
        var rows = members.Select(m => (IReadOnlyList<TgButton>)new List<TgButton>
        {
            new($"{m.Name}: {(m.SentimentOptOut ? "❌ Tahlil o'chiq" : "✅ Tahlil yoniq")}", $"priv:{m.Id}:{(m.SentimentOptOut ? "0" : "1")}"),
        }).ToList();
        await tg.SendMessageAsync(chatId, "🔒 Kayfiyat tahlili sozlamalari:", rows, ct: ct);
    }

    private async Task HandleHelpRequestAsync(long chatId, long userId, string text, CancellationToken ct)
    {
        var groups = await db.FamilyMembers.AsNoTracking().Where(m => m.TelegramId == userId && m.Status == MemberStatus.Active)
            .Join(db.Families, m => m.FamilyId, f => f.Id, (m, f) => f.TelegramGroupId).Where(g => g != null).Distinct().ToListAsync(ct);
        var sent = 0;
        foreach (var g in groups) { await tg.SendMessageAsync(g!.Value, $"🆘 Yordam so'rovi: {text}", ct: ct); sent++; }
        await tg.SendMessageAsync(chatId, $"Yordam so'rovingiz {sent} ta guruhga yuborildi.", ct: ct);
    }

    private async Task HandleBirthdayGreetingAsync(long chatId, long userId, JsonElement from, Guid memberId, CancellationToken ct)
    {
        var member = await db.FamilyMembers.FirstOrDefaultAsync(m => m.Id == memberId, ct);
        if (member is null) return;
        var year = DateTime.UtcNow.Year;
        if (!await db.BirthdayGreetings.AnyAsync(g => g.MemberId == memberId && g.GreeterTelegramId == userId && g.GreetingYear == year, ct))
        {
            db.BirthdayGreetings.Add(new BirthdayGreeting { FamilyId = member.FamilyId, MemberId = memberId, GreeterTelegramId = userId, GreeterName = DisplayName(from), GreetingYear = year });
            await db.SaveChangesAsync(ct);
            await tg.SendMessageAsync(member.TelegramId, $"🎂 Sizni {DisplayName(from)} tabrikladi!", ct: ct);
        }
    }

    private async Task HandleAvatarConfirmAsync(long chatId, long userId, string data, CancellationToken ct)
    {
        var id = Guid.Parse(data[5..]);
        var pending = await db.PendingAvatarUploads.FirstOrDefaultAsync(p => p.Id == id && p.TelegramId == userId, ct);
        if (pending is null) return;
        if (data.StartsWith("avno:")) { db.PendingAvatarUploads.Remove(pending); await db.SaveChangesAsync(ct); await tg.SendMessageAsync(chatId, "❌ Bekor qilindi.", ct: ct); return; }
        db.PendingAvatarUploads.Remove(pending);
        await db.SaveChangesAsync(ct);
        await tg.SendMessageAsync(chatId, "✅ Profil rasmingiz qabul qilindi (mini app orqali ko'rinadi).", ct: ct);
    }

    private async Task HandleLinkCommandAsync(JsonElement msg, long chatId, long userId, string text, CancellationToken ct)
    {
        var parts = text.Split(' ', 2);
        if (parts.Length < 2) { await tg.SendMessageAsync(chatId, "Foydalanish: /link &lt;TAKLIF_KODI&gt;", ct: ct); return; }
        var code = parts[1].Trim().ToUpperInvariant();
        var family = await db.Families.FirstOrDefaultAsync(f => f.InviteCode == code, ct);
        if (family is null) { await tg.SendMessageAsync(chatId, "❌ Taklif kodi noto'g'ri.", ct: ct); return; }
        if (!await tg.IsChatAdminAsync(chatId, userId, ct)) { await tg.SendMessageAsync(chatId, "❌ Faqat guruh admini ulashi mumkin.", ct: ct); return; }
        if (family.TelegramGroupId is not null && family.TelegramGroupId != chatId) { await tg.SendMessageAsync(chatId, "❌ Bu oila boshqa guruhga ulangan.", ct: ct); return; }
        family.TelegramGroupId = chatId;
        family.TelegramGroupTitle = msg.Path("chat", "title").Str();
        if (!await db.FamilySettings.AnyAsync(s => s.FamilyId == family.Id, ct)) db.FamilySettings.Add(new FamilySettings { FamilyId = family.Id });
        await db.SaveChangesAsync(ct);
        await tg.SendMessageAsync(chatId, $"✅ Guruh <b>{family.Name}</b> oilasiga ulandi.", ct: ct);
    }

    private async Task TrackMessageAsync(Guid familyId, long userId, string? text, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var stat = await db.MessagesStats.FirstOrDefaultAsync(s => s.FamilyId == familyId && s.TelegramId == userId && s.MessageDate == today, ct);
        if (stat is null) db.MessagesStats.Add(new MessagesStat { FamilyId = familyId, TelegramId = userId, MessageDate = today, MessagesCount = 1 });
        else stat.MessagesCount++;

        if (!string.IsNullOrWhiteSpace(text))
        {
            var member = await cache.GetMemberAsync(familyId, userId, ct);
            if (member is { SentimentOptOut: false })
            {
                var trimmed = text.Length > 1000 ? text[..1000] : text;
                var hash = SHA256.HashData(Encoding.UTF8.GetBytes(trimmed));
                if (!await db.DailyMessageBuffers.AnyAsync(b => b.FamilyId == familyId && b.TelegramId == userId && b.MessageDate == today && b.TextHash == hash, ct))
                    db.DailyMessageBuffers.Add(new DailyMessageBuffer { FamilyId = familyId, TelegramId = userId, MemberId = member.Id, MessageDate = today, Text = trimmed, TextHash = hash });
            }
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task SaveMemoryIfMediaAsync(Guid familyId, long chatId, long userId, JsonElement msg, CancellationToken ct)
    {
        string? kind = null, fileId = null;
        if (msg.Prop("photo") is { ValueKind: JsonValueKind.Array } photos && photos.GetArrayLength() > 0)
        { kind = "photo"; fileId = photos[photos.GetArrayLength() - 1].Prop("file_id").Str(); }
        else if (msg.Prop("video") is { } video) { kind = "video"; fileId = video.Prop("file_id").Str(); }
        else if (msg.Prop("document") is { } doc) { kind = "document"; fileId = doc.Prop("file_id").Str(); }
        if (kind is null || fileId is null) return;

        var member = await cache.GetMemberAsync(familyId, userId, ct);
        db.Memories.Add(new Memory
        {
            FamilyId = familyId, Kind = kind, TelegramFileId = fileId, Caption = msg.Prop("caption").Str(),
            SavedByTelegramId = userId, SavedByMemberId = member?.Id, MessageYear = DateTime.UtcNow.Year,
            SourceChatId = chatId, SourceMessageId = msg.Prop("message_id").Long(),
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task MaybeQueueVideoDownloadAsync(Guid familyId, long chatId, long userId, int messageId,
        JsonElement msg, string? bodyText, CancellationToken ct)
    {
        if (!videoDownloader.Enabled || messageId == 0) return;

        var settings = await cache.GetFamilySettingsAsync(familyId, ct);
        if (settings?.AutoVideoDownload != true) return;

        var link = VideoLinkDetector.FirstSupportedUrl(bodyText);
        if (link is null) return;

        var job = new VideoDownloadJob
        {
            FamilyId = familyId,
            ChatId = chatId,
            ThreadId = msg.Prop("message_thread_id").Int(),
            OriginalMessageId = messageId,
            RequesterTelegramId = userId,
            Url = link,
        };
        db.VideoDownloadJobs.Add(job);
        await db.SaveChangesAsync(ct);
        await videoQueue.EnqueueAsync(job.Id, ct);
    }

    private async Task MaybeDeleteServiceMessageAsync(Guid familyId, long chatId, JsonElement msg, CancellationToken ct)
    {
        var settings = await cache.GetFamilySettingsAsync(familyId, ct);
        if (settings?.DeleteJoinLeaveMessages == true && msg.Prop("message_id").Int() is { } mid)
            await tg.DeleteMessageAsync(chatId, mid, ct);
    }

    // =================== helpers ===================
    private async Task<(AppUser user, Profile profile)> EnsureUserAsync(long telegramId, JsonElement from, CancellationToken ct)
    {
        var profile = await db.Profiles.FirstOrDefaultAsync(p => p.TelegramId == telegramId, ct);
        if (profile is not null) { var u = await db.Users.FirstAsync(x => x.Id == profile.UserId, ct); return (u, profile); }
        var user = new AppUser { Email = $"tg{telegramId}@telegram.local", DisplayName = DisplayName(from), EmailConfirmed = true };
        db.Users.Add(user);
        profile = new Profile { UserId = user.Id, TelegramId = telegramId, TelegramUsername = from.Prop("username").Str(), DisplayName = DisplayName(from), Email = user.Email };
        db.Profiles.Add(profile);
        await db.SaveChangesAsync(ct);
        return (user, profile);
    }

    private static string DisplayName(JsonElement from) =>
        $"{from.Prop("first_name").Str()} {from.Prop("last_name").Str()}".Trim() is { Length: > 0 } s ? s : (from.Prop("username").Str() ?? "Foydalanuvchi");

    private static string GenerateInviteCode() => Convert.ToHexString(Guid.NewGuid().ToByteArray())[..8].ToUpperInvariant();

    private static string SnakeToPascal(string snake) =>
        string.Concat(snake.Split('_').Select(p => p.Length == 0 ? p : char.ToUpperInvariant(p[0]) + p[1..]));

    private string BuildHelp(string lang) =>
        $"{loc.T("welcome", lang)}\n\n" +
        "📋 Buyruqlar:\n/start — boshlash\n/kim — qarindoshlikni hisoblash\n/privacy — maxfiylik\n/yordam — yordam so'rash\n/reset — qayta boshlash";
}
