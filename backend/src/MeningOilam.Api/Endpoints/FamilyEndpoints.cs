using MeningOilam.Api.Common;
using MeningOilam.Application.Abstractions;
using MeningOilam.Domain.Entities;
using MeningOilam.Domain.Enums;
using MeningOilam.Infrastructure.Configuration;
using MeningOilam.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MeningOilam.Api.Endpoints;

public record CreateFamilyRequest(string Name, long? TelegramGroupId, string? TelegramGroupTitle, long? MyTelegramId, string MyFullName);

public static class FamilyEndpoints
{
    public static void MapFamilyEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/families").RequireAuthorization();

        g.MapGet("/", async (ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            var userId = cu.RequireUserId();
            IQueryable<Family> q = db.Families.AsNoTracking();
            if (!await authz.IsGlobalSuperadminAsync(userId, ct))
            {
                var familyIds = await db.UserRoles.AsNoTracking()
                    .Where(r => r.UserId == userId && r.FamilyId != null)
                    .Select(r => r.FamilyId!.Value).ToListAsync(ct);
                q = q.Where(f => f.OwnerUserId == userId || familyIds.Contains(f.Id));
            }
            var families = await q.OrderByDescending(f => f.CreatedAt)
                .Select(f => new { f.Id, f.Name, f.TelegramGroupId, f.TelegramGroupTitle, f.InviteCode, f.OwnerUserId, f.CreatedAt })
                .ToListAsync(ct);
            return Results.Ok(new { families });
        });

        g.MapPost("/", async (CreateFamilyRequest req, ICurrentUser cu, AppDbContext db, CancellationToken ct) =>
        {
            var userId = cu.RequireUserId();
            if (string.IsNullOrWhiteSpace(req.Name) || req.Name.Length is < 2 or > 100)
                throw new ValidationException("Oila nomi 2-100 belgi bo'lishi kerak");

            var family = new Family
            {
                Name = req.Name.Trim(),
                TelegramGroupId = req.TelegramGroupId,
                TelegramGroupTitle = req.TelegramGroupTitle,
                OwnerUserId = userId,
                InviteCode = GenerateInviteCode(),
            };
            db.Families.Add(family);
            db.FamilySettings.Add(new FamilySettings { FamilyId = family.Id });
            db.UserRoles.Add(new UserRole { UserId = userId, FamilyId = family.Id, Role = AppRole.Admin });

            if (req.MyTelegramId is not null)
            {
                db.FamilyMembers.Add(new FamilyMember
                {
                    FamilyId = family.Id, TelegramId = req.MyTelegramId.Value,
                    FullName = req.MyFullName, Status = MemberStatus.Active, UserId = userId,
                });
            }
            db.ActionLogs.Add(new ActionLog { FamilyId = family.Id, ActorUserId = userId, Action = "family_created" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { id = family.Id, invite_code = family.InviteCode });
        });

        g.MapGet("/{familyId:guid}/stats", async (Guid familyId, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyMemberAsync(cu.RequireUserId(), familyId, ct);
            var members = await db.FamilyMembers.CountAsync(m => m.FamilyId == familyId && m.Status == MemberStatus.Active, ct);
            var pending = await db.JoinRequests.CountAsync(j => j.FamilyId == familyId && j.Status == JoinRequestStatus.AwaitingAdminApproval, ct);
            var rels = await db.Relationships.CountAsync(r => r.FamilyId == familyId, ct);
            return Results.Ok(new { members, pendingRequests = pending, relationships = rels });
        });

        g.MapPost("/{familyId:guid}/regenerate-invite", async (Guid familyId, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            var family = await db.Families.FirstOrDefaultAsync(f => f.Id == familyId, ct) ?? throw new NotFoundException();
            family.InviteCode = GenerateInviteCode();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { invite_code = family.InviteCode });
        });

        g.MapGet("/{familyId:guid}/invite", async (Guid familyId, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, IOptions<TelegramOptions> tg, CancellationToken ct) =>
        {
            await authz.EnsureFamilyMemberAsync(cu.RequireUserId(), familyId, ct);
            var family = await db.Families.AsNoTracking().FirstOrDefaultAsync(f => f.Id == familyId, ct) ?? throw new NotFoundException();
            return Results.Ok(new { invite_code = family.InviteCode, bot_username = tg.Value.BotUsername });
        });

        // Export full family tree as JSON (admins only)
        g.MapGet("/{familyId:guid}/export", async (Guid familyId, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            var family = await db.Families.AsNoTracking()
                .Select(f => new { f.Id, f.Name, f.TelegramGroupTitle, f.InviteCode, f.CreatedAt })
                .FirstOrDefaultAsync(f => f.Id == familyId, ct) ?? throw new NotFoundException();
            var members = await db.FamilyMembers.AsNoTracking().Where(m => m.FamilyId == familyId)
                .Select(m => new { m.Id, m.FullName, m.Gender, m.BirthDate, m.Phone, m.Username, m.TelegramId, m.Status, m.PhotoUrl, m.Bio, m.JoinedAt, m.InvitedBy })
                .ToListAsync(ct);
            var relationships = await db.Relationships.AsNoTracking().Where(r => r.FamilyId == familyId)
                .Select(r => new { r.Id, r.MemberId1, r.MemberId2, r.RelationshipType, r.CreatedAt })
                .ToListAsync(ct);
            return Results.Ok(new
            {
                exported_at = DateTimeOffset.UtcNow,
                version = 1,
                family,
                members,
                relationships,
            });
        });
    }

    public static string GenerateInviteCode() =>
        Convert.ToHexString(Guid.NewGuid().ToByteArray())[..8].ToUpperInvariant();
}
