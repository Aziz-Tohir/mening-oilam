using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using MeningOilam.Application.Abstractions;
using MeningOilam.Domain.Entities;
using MeningOilam.Domain.Enums;
using MeningOilam.Infrastructure.Caching;
using MeningOilam.Infrastructure.Data;
using MeningOilam.Infrastructure.Media;
using Microsoft.EntityFrameworkCore;

namespace MeningOilam.Infrastructure.Bot;

/// <summary>Ports moderation.server.ts: anti-link/forward/flood, banned words, warning escalation.</summary>
public class ModerationService(AppDbContext db, BotCache cache, ITelegramService tg)
{
    private static readonly Regex LinkRegex =
        new(@"(https?:\/\/[^\s]+|t\.me\/[^\s]+|@[A-Za-z0-9_]{4,})", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // per (chat,user) last-message timestamp for anti-flood
    private static readonly ConcurrentDictionary<(long, long), DateTimeOffset> LastMessage = new();

    public record ModerationOutcome(bool Deleted, bool Warned, string? Reason);

    public async Task<ModerationOutcome> ModerateAsync(Guid familyId, long chatId, long userId, int messageId,
        string? text, bool isForward, CancellationToken ct)
    {
        var settings = await cache.GetFamilySettingsAsync(familyId, ct);
        if (settings is null) return new(false, false, null);

        // Anti-forward
        if (settings.AntiForward && isForward)
        {
            await tg.DeleteMessageAsync(chatId, messageId, ct);
            return new(true, false, "forward");
        }

        // Anti-flood
        if (settings.AntiFloodSeconds > 0)
        {
            var key = (chatId, userId);
            var now = DateTimeOffset.UtcNow;
            if (LastMessage.TryGetValue(key, out var last) && (now - last).TotalSeconds < settings.AntiFloodSeconds)
            {
                await tg.DeleteMessageAsync(chatId, messageId, ct);
                LastMessage[key] = now;
                return new(true, false, "flood");
            }
            LastMessage[key] = now;
        }

        var searchText = text ?? "";

        // Banned words
        var banned = await cache.GetBannedWordsAsync(familyId, ct);
        foreach (var w in banned)
        {
            bool match;
            try
            {
                match = w.IsRegex
                    ? Regex.IsMatch(searchText, w.Pattern, RegexOptions.IgnoreCase)
                    : searchText.Contains(w.Pattern, StringComparison.OrdinalIgnoreCase);
            }
            catch { match = false; }
            if (!match) continue;

            await tg.DeleteMessageAsync(chatId, messageId, ct);
            if (w.Action == "warn") return await WarnAsync(familyId, chatId, userId, "Taqiqlangan so'z", settings, ct);
            if (w.Action == "kick") { await KickAsync(familyId, chatId, userId, settings, ct); return new(true, true, "banned_word_kick"); }
            return new(true, false, "banned_word");
        }

        // Anti-link
        if (settings.AntiLink && !string.IsNullOrEmpty(searchText) && LinkRegex.IsMatch(searchText))
        {
            var domainAllowed = settings.AllowedLinkDomains.Any(d => searchText.Contains(d, StringComparison.OrdinalIgnoreCase));
            // Clean-video relay is on and this is a supported video link → it's handled, not spam.
            // Don't delete it here; the download pipeline (and VideoDownloadDeleteOriginal) takes over.
            var videoHandled = settings.AutoVideoDownload && VideoLinkDetector.FirstSupportedUrl(searchText) is not null;
            if (!domainAllowed && !videoHandled)
            {
                await tg.DeleteMessageAsync(chatId, messageId, ct);
                return await WarnAsync(familyId, chatId, userId, "Havolalar taqiqlangan", settings, ct);
            }
        }

        return new(false, false, null);
    }

    private async Task<ModerationOutcome> WarnAsync(Guid familyId, long chatId, long userId, string reason, FamilySettings settings, CancellationToken ct)
    {
        var member = await db.FamilyMembers.FirstOrDefaultAsync(m => m.FamilyId == familyId && m.TelegramId == userId, ct);
        if (member is null) return new(true, false, reason);

        db.MemberWarnings.Add(new MemberWarning { FamilyId = familyId, MemberId = member.Id, TelegramId = userId, Reason = reason, Auto = true });
        await db.SaveChangesAsync(ct);

        var count = await db.MemberWarnings.CountAsync(w => w.FamilyId == familyId && w.MemberId == member.Id, ct);
        if (count >= settings.MaxWarnings)
        {
            await ApplyWarningActionAsync(chatId, userId, member, settings, ct);
            await tg.SendMessageAsync(chatId, $"🚫 <a href=\"tg://user?id={userId}\">{member.FullName}</a> {settings.MaxWarnings} ta ogohlantirish oldi va chetlatildi.", ct: ct);
            return new(true, true, $"{reason}_escalated");
        }
        await tg.SendMessageAsync(chatId, $"⚠️ <a href=\"tg://user?id={userId}\">{member.FullName}</a>, {reason}. ({count}/{settings.MaxWarnings})", ct: ct);
        return new(true, true, reason);
    }

    private async Task ApplyWarningActionAsync(long chatId, long userId, FamilyMember member, FamilySettings settings, CancellationToken ct)
    {
        switch (settings.WarningAction)
        {
            case "ban": await tg.BanAsync(chatId, userId, ct); member.Status = MemberStatus.Blocked; break;
            case "mute": await tg.RestrictAsync(chatId, userId, DateTimeOffset.UtcNow.AddHours(1), ct); break;
            default: await tg.BanAsync(chatId, userId, ct); await tg.UnbanAsync(chatId, userId, ct); member.Status = MemberStatus.Blocked; break;
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task KickAsync(Guid familyId, long chatId, long userId, FamilySettings settings, CancellationToken ct)
    {
        var member = await db.FamilyMembers.FirstOrDefaultAsync(m => m.FamilyId == familyId && m.TelegramId == userId, ct);
        await tg.BanAsync(chatId, userId, ct);
        await tg.UnbanAsync(chatId, userId, ct);
        if (member is not null) { member.Status = MemberStatus.Blocked; await db.SaveChangesAsync(ct); }
    }
}
