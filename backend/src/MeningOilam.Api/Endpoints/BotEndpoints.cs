using System.Text.Json;
using MeningOilam.Api.Common;
using MeningOilam.Application.Abstractions;
using MeningOilam.Domain.Entities;
using MeningOilam.Domain.Enums;
using MeningOilam.Infrastructure.Caching;
using MeningOilam.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace MeningOilam.Api.Endpoints;

public record BannedWordRequest(string Pattern, bool IsRegex, string Action);
public record WarningRequest(Guid MemberId, string Reason);
public record ModerateRequest(string Action); // kick | ban | mute_1h | mute_24h | unban
public record BroadcastRequest(string Target, string Text, string? GenderFilter, string? ParseMode);
public record BotIntegrationRequest(string BotUsername, string Mode, bool IsActive);

public static class BotEndpoints
{
    public static void MapBotEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/families/{familyId:guid}/bot").RequireAuthorization();

        // ---- Banned words ----
        g.MapGet("/banned-words", async (Guid familyId, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyMemberAsync(cu.RequireUserId(), familyId, ct);
            var items = await db.BannedWords.AsNoTracking().Where(w => w.FamilyId == familyId).ToListAsync(ct);
            return Results.Ok(new { items });
        });

        g.MapPost("/banned-words", async (Guid familyId, BannedWordRequest req, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, BotCache cache, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            db.BannedWords.Add(new BannedWord { FamilyId = familyId, Pattern = req.Pattern, IsRegex = req.IsRegex, Action = req.Action, CreatedBy = cu.UserId });
            await db.SaveChangesAsync(ct);
            await cache.InvalidateFamilyAsync(familyId);
            return Results.Ok(new { ok = true });
        });

        g.MapDelete("/banned-words/{id:guid}", async (Guid familyId, Guid id, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, BotCache cache, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            await db.BannedWords.Where(w => w.Id == id && w.FamilyId == familyId).ExecuteDeleteAsync(ct);
            await cache.InvalidateFamilyAsync(familyId);
            return Results.Ok(new { ok = true });
        });

        // ---- Warnings ----
        g.MapGet("/warnings", async (Guid familyId, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyMemberAsync(cu.RequireUserId(), familyId, ct);
            var items = await db.MemberWarnings.AsNoTracking().Where(w => w.FamilyId == familyId)
                .Join(db.FamilyMembers, w => w.MemberId, m => m.Id, (w, m) => new { w.Id, w.MemberId, member_name = m.FullName, w.Reason, w.Auto, w.CreatedAt })
                .OrderByDescending(x => x.CreatedAt).ToListAsync(ct);
            return Results.Ok(new { items });
        });

        g.MapPost("/warnings", async (Guid familyId, WarningRequest req, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, ITelegramService tg, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            var member = await db.FamilyMembers.FirstOrDefaultAsync(m => m.Id == req.MemberId && m.FamilyId == familyId, ct) ?? throw new NotFoundException();
            db.MemberWarnings.Add(new MemberWarning { FamilyId = familyId, MemberId = req.MemberId, TelegramId = member.TelegramId, Reason = req.Reason, IssuedByUserId = cu.UserId });
            db.ActionLogs.Add(new ActionLog { FamilyId = familyId, ActorUserId = cu.UserId, Action = "warning_issued" });
            await db.SaveChangesAsync(ct);
            await tg.SendMessageAsync(member.TelegramId, $"⚠️ Sizga ogohlantirish berildi: {req.Reason}", ct: ct);
            return Results.Ok(new { ok = true });
        });

        g.MapDelete("/warnings/{memberId:guid}", async (Guid familyId, Guid memberId, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            await db.MemberWarnings.Where(w => w.FamilyId == familyId && w.MemberId == memberId).ExecuteDeleteAsync(ct);
            return Results.Ok(new { ok = true });
        });

        // ---- Moderate member ----
        g.MapPost("/moderate/{memberId:guid}", async (Guid familyId, Guid memberId, ModerateRequest req, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, ITelegramService tg, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            var family = await db.Families.AsNoTracking().FirstOrDefaultAsync(f => f.Id == familyId, ct) ?? throw new NotFoundException();
            var member = await db.FamilyMembers.FirstOrDefaultAsync(m => m.Id == memberId && m.FamilyId == familyId, ct) ?? throw new NotFoundException();
            if (family.TelegramGroupId is null) throw new ValidationException("Guruh ulanmagan");
            var chatId = family.TelegramGroupId.Value;

            switch (req.Action)
            {
                case "ban": await tg.BanAsync(chatId, member.TelegramId, ct); member.Status = MemberStatus.Blocked; break;
                case "kick": await tg.BanAsync(chatId, member.TelegramId, ct); await tg.UnbanAsync(chatId, member.TelegramId, ct); member.Status = MemberStatus.Blocked; break;
                case "mute_1h": await tg.RestrictAsync(chatId, member.TelegramId, DateTimeOffset.UtcNow.AddHours(1), ct); break;
                case "mute_24h": await tg.RestrictAsync(chatId, member.TelegramId, DateTimeOffset.UtcNow.AddHours(24), ct); break;
                case "unban": await tg.UnbanAsync(chatId, member.TelegramId, ct); member.Status = MemberStatus.Active; break;
                default: throw new ValidationException("Noma'lum amal");
            }
            db.ActionLogs.Add(new ActionLog { FamilyId = familyId, ActorUserId = cu.UserId, Action = $"moderate_{req.Action}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        });

        // ---- Broadcast ----
        g.MapPost("/broadcast", async (Guid familyId, BroadcastRequest req, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, ITelegramService tg, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            if (string.IsNullOrWhiteSpace(req.Text) || req.Text.Length > 4000) throw new ValidationException("Matn 1-4000 belgi");
            var family = await db.Families.AsNoTracking().FirstOrDefaultAsync(f => f.Id == familyId, ct) ?? throw new NotFoundException();
            var parseMode = req.ParseMode == "HTML" ? "HTML" : null;
            int recipients = 0, failures = 0;
            var failed = new List<long>();

            if (req.Target == "group")
            {
                if (family.TelegramGroupId is null) throw new ValidationException("Guruh ulanmagan");
                var id = await tg.SendMessageAsync(family.TelegramGroupId.Value, req.Text, parseMode: parseMode, ct: ct);
                if (id is not null) recipients++; else failures++;
            }
            else
            {
                var membersQuery = db.FamilyMembers.AsNoTracking().Where(m => m.FamilyId == familyId && m.Status == MemberStatus.Active);
                if (req.GenderFilter is "male" or "female")
                    membersQuery = membersQuery.Where(m => m.Gender == Enum.Parse<GenderType>(req.GenderFilter, true));
                var members = await membersQuery.Select(m => m.TelegramId).ToListAsync(ct);
                foreach (var tgId in members)
                {
                    var id = await tg.SendMessageAsync(tgId, req.Text, parseMode: parseMode, ct: ct);
                    if (id is not null) recipients++; else { failures++; failed.Add(tgId); }
                    await Task.Delay(50, ct);
                }
            }

            db.BotBroadcasts.Add(new BotBroadcast
            {
                FamilyId = familyId, Target = req.Target, MessageText = req.Text, SentByUserId = cu.UserId,
                RecipientsCount = recipients, FailuresCount = failures, GenderFilter = req.GenderFilter,
                FailedTargets = failed.Count > 0 ? JsonSerializer.SerializeToDocument(failed) : null,
            });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { recipients, failures, failedTargets = failed });
        });

        g.MapGet("/broadcasts", async (Guid familyId, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyMemberAsync(cu.RequireUserId(), familyId, ct);
            var items = await db.BotBroadcasts.AsNoTracking().Where(b => b.FamilyId == familyId)
                .OrderByDescending(b => b.CreatedAt).Take(50).ToListAsync(ct);
            return Results.Ok(new { items });
        });

        // ---- Bot integrations ----
        g.MapGet("/integrations", async (Guid familyId, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyMemberAsync(cu.RequireUserId(), familyId, ct);
            var items = await db.BotIntegrations.AsNoTracking().Where(b => b.FamilyId == familyId).ToListAsync(ct);
            return Results.Ok(new { items });
        });

        g.MapPost("/integrations", async (Guid familyId, BotIntegrationRequest req, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            var existing = await db.BotIntegrations.FirstOrDefaultAsync(b => b.FamilyId == familyId && b.BotUsername == req.BotUsername, ct);
            var mode = Enum.Parse<BotIntegrationMode>(req.Mode.Replace("_", ""), true);
            if (existing is null)
                db.BotIntegrations.Add(new BotIntegration { FamilyId = familyId, BotUsername = req.BotUsername, Mode = mode, IsActive = req.IsActive, AddedBy = cu.UserId });
            else { existing.Mode = mode; existing.IsActive = req.IsActive; }
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        });
    }
}
