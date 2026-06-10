using MeningOilam.Api.Common;
using MeningOilam.Application.Abstractions;
using MeningOilam.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace MeningOilam.Api.Endpoints;

public static class StatsEndpoints
{
    public static void MapStatsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/families/{familyId:guid}/stats/messages", async (Guid familyId, int days, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyMemberAsync(cu.RequireUserId(), familyId, ct);
            if (days <= 0) days = 30;
            var since = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-days));

            var rows = await db.MessagesStats.AsNoTracking()
                .Where(s => s.FamilyId == familyId && s.MessageDate >= since).ToListAsync(ct);
            var memberNames = await db.FamilyMembers.AsNoTracking().Where(m => m.FamilyId == familyId)
                .ToDictionaryAsync(m => m.TelegramId, m => m.FullName, ct);

            var top = rows.GroupBy(r => r.TelegramId)
                .Select(grp => new { telegram_id = grp.Key, name = grp.Key != null && memberNames.TryGetValue(grp.Key.Value, out var n) ? n : "?", count = grp.Sum(x => x.MessagesCount) })
                .OrderByDescending(x => x.count).Take(20).ToList();
            var trend = rows.GroupBy(r => r.MessageDate)
                .Select(grp => new { date = grp.Key, count = grp.Sum(x => x.MessagesCount) })
                .OrderBy(x => x.date).ToList();
            return Results.Ok(new { top, trend, total = rows.Sum(r => r.MessagesCount) });
        }).RequireAuthorization();

        app.MapGet("/api/families/{familyId:guid}/sentiment", async (Guid familyId, int days, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyMemberAsync(cu.RequireUserId(), familyId, ct);
            if (days <= 0) days = 30;
            var since = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-days));
            var rows = await db.MessagesStats.AsNoTracking()
                .Where(s => s.FamilyId == familyId && s.MessageDate >= since && s.SentimentScore != null)
                .Select(s => new { s.TelegramId, s.MessageDate, s.SentimentScore }).ToListAsync(ct);
            var members = await db.FamilyMembers.AsNoTracking().Where(m => m.FamilyId == familyId)
                .Select(m => new { m.Id, m.TelegramId, m.FullName, m.SentimentOptOut }).ToListAsync(ct);
            return Results.Ok(new { rows, members });
        }).RequireAuthorization();

        app.MapPost("/api/members/{memberId:guid}/sentiment-opt-out", async (Guid memberId, OptOutBody body, ICurrentUser cu, AppDbContext db, CancellationToken ct) =>
        {
            var userId = cu.RequireUserId();
            var m = await db.FamilyMembers.FirstOrDefaultAsync(x => x.Id == memberId && x.UserId == userId, ct)
                    ?? throw new ForbiddenException("Faqat o'z profilingiz");
            m.SentimentOptOut = body.OptOut;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization();
    }

    public record OptOutBody(bool OptOut);
}

public static class AwardsEndpoints
{
    public static void MapAwardsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/families/{familyId:guid}/nominations", async (Guid familyId, int? year, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyMemberAsync(cu.RequireUserId(), familyId, ct);
            var q = db.Nominations.AsNoTracking().Where(n => n.FamilyId == familyId);
            if (year is not null) q = q.Where(n => n.Year == year);
            var nominations = await q.OrderByDescending(n => n.Year).ToListAsync(ct);
            return Results.Ok(new { nominations });
        }).RequireAuthorization();

        app.MapGet("/api/families/{familyId:guid}/memories", async (Guid familyId, int? year, int limit, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyMemberAsync(cu.RequireUserId(), familyId, ct);
            if (limit <= 0) limit = 100;
            var q = db.Memories.AsNoTracking().Where(m => m.FamilyId == familyId);
            if (year is not null) q = q.Where(m => m.MessageYear == year);
            var memories = await q.OrderByDescending(m => m.CreatedAt).Take(limit).ToListAsync(ct);
            return Results.Ok(new { memories });
        }).RequireAuthorization();
    }
}
