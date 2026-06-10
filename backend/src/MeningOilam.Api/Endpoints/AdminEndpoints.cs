using MeningOilam.Api.Common;
using MeningOilam.Application.Abstractions;
using MeningOilam.Domain.Entities;
using MeningOilam.Domain.Enums;
using MeningOilam.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace MeningOilam.Api.Endpoints;

public record UpdateFamilyRequest(string? Name);
public record TransferOwnershipRequest(Guid NewOwnerUserId);

public static class AdminEndpoints
{
    public static void MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").RequireAuthorization();

        g.MapGet("/families", async (ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureGlobalSuperadminAsync(cu.RequireUserId(), ct);
            var families = await db.Families.AsNoTracking().OrderByDescending(f => f.CreatedAt)
                .Select(f => new
                {
                    f.Id, f.Name, f.TelegramGroupId, f.TelegramGroupTitle, f.InviteCode, f.OwnerUserId, f.CreatedAt,
                    member_count = db.FamilyMembers.Count(m => m.FamilyId == f.Id),
                    owner_email = db.Users.Where(u => u.Id == f.OwnerUserId).Select(u => u.Email).FirstOrDefault(),
                }).ToListAsync(ct);
            return Results.Ok(new { families });
        });

        g.MapPatch("/families/{familyId:guid}", async (Guid familyId, UpdateFamilyRequest req, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureGlobalSuperadminAsync(cu.RequireUserId(), ct);
            var f = await db.Families.FirstOrDefaultAsync(x => x.Id == familyId, ct) ?? throw new NotFoundException();
            if (req.Name is not null) f.Name = req.Name;
            db.ActionLogs.Add(new ActionLog { FamilyId = familyId, ActorUserId = cu.UserId, Action = "family_updated_superadmin" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        });

        g.MapDelete("/families/{familyId:guid}", async (Guid familyId, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureGlobalSuperadminAsync(cu.RequireUserId(), ct);
            // Cascade deletes handle dependent rows (FK ON DELETE CASCADE).
            await db.Families.Where(f => f.Id == familyId).ExecuteDeleteAsync(ct);
            return Results.Ok(new { ok = true });
        });

        g.MapPost("/families/{familyId:guid}/transfer", async (Guid familyId, TransferOwnershipRequest req, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureGlobalSuperadminAsync(cu.RequireUserId(), ct);
            var f = await db.Families.FirstOrDefaultAsync(x => x.Id == familyId, ct) ?? throw new NotFoundException();
            f.OwnerUserId = req.NewOwnerUserId;
            if (!await db.UserRoles.AnyAsync(r => r.UserId == req.NewOwnerUserId && r.FamilyId == familyId && r.Role == AppRole.Admin, ct))
                db.UserRoles.Add(new UserRole { UserId = req.NewOwnerUserId, FamilyId = familyId, Role = AppRole.Admin });
            db.ActionLogs.Add(new ActionLog { FamilyId = familyId, ActorUserId = cu.UserId, Action = "ownership_transferred" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        });

        // Debug: raw telegram updates (global admin only)
        g.MapGet("/telegram-updates", async (int limit, bool onlyErrors, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureGlobalSuperadminAsync(cu.RequireUserId(), ct);
            if (limit <= 0) limit = 100;
            var q = db.TelegramUpdatesRaw.AsNoTracking().AsQueryable();
            if (onlyErrors) q = q.Where(u => u.Error != null);
            var rows = await q.OrderByDescending(u => u.UpdateId).Take(limit)
                .Select(u => new { u.UpdateId, u.ProcessedAt, u.Error, u.CreatedAt }).ToListAsync(ct);
            var total = await db.TelegramUpdatesRaw.CountAsync(ct);
            var errors = await db.TelegramUpdatesRaw.CountAsync(u => u.Error != null, ct);
            var unprocessed = await db.TelegramUpdatesRaw.CountAsync(u => u.ProcessedAt == null, ct);
            return Results.Ok(new { rows, stats = new { total, errors, unprocessed } });
        });
    }
}
