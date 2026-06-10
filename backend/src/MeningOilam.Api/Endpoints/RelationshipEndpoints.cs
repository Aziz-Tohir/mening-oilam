using MeningOilam.Api.Common;
using MeningOilam.Application.Abstractions;
using MeningOilam.Domain.Entities;
using MeningOilam.Domain.Enums;
using MeningOilam.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace MeningOilam.Api.Endpoints;

public record AddRelationshipRequest(Guid MemberId1, Guid MemberId2, string RelationshipType);

public static class RelationshipEndpoints
{
    public static void MapRelationshipEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/families/{familyId:guid}/relationships").RequireAuthorization();

        g.MapGet("/", async (Guid familyId, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyMemberAsync(cu.RequireUserId(), familyId, ct);
            var rels = await db.Relationships.AsNoTracking().Where(r => r.FamilyId == familyId)
                .Join(db.FamilyMembers, r => r.MemberId1, m => m.Id, (r, m1) => new { r, m1 })
                .Join(db.FamilyMembers, x => x.r.MemberId2, m => m.Id, (x, m2) => new
                {
                    x.r.Id, x.r.MemberId1, x.r.MemberId2, x.r.RelationshipType,
                    member1_name = x.m1.FullName, member2_name = m2.FullName,
                }).ToListAsync(ct);
            return Results.Ok(new { relationships = rels });
        });

        g.MapPost("/", async (Guid familyId, AddRelationshipRequest req, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            if (req.MemberId1 == req.MemberId2) throw new ValidationException("A'zo o'zi bilan bog'lanmaydi");
            var type = Enum.Parse<RelationshipType>(req.RelationshipType, true);
            var exists = await db.Relationships.AnyAsync(r => r.FamilyId == familyId &&
                ((r.MemberId1 == req.MemberId1 && r.MemberId2 == req.MemberId2) ||
                 (r.MemberId1 == req.MemberId2 && r.MemberId2 == req.MemberId1)) && r.RelationshipType == type, ct);
            if (exists) throw new ValidationException("Bunday bog'lanish allaqachon mavjud");
            db.Relationships.Add(new Relationship
            {
                FamilyId = familyId, MemberId1 = req.MemberId1, MemberId2 = req.MemberId2,
                RelationshipType = type, CreatedBy = cu.UserId,
            });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        });

        g.MapDelete("/{id:guid}", async (Guid familyId, Guid id, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            await db.Relationships.Where(r => r.Id == id && r.FamilyId == familyId).ExecuteDeleteAsync(ct);
            return Results.Ok(new { ok = true });
        });

        // Tree export (admin only)
        app.MapGet("/api/families/{familyId:guid}/tree/export", async (Guid familyId, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            var family = await db.Families.AsNoTracking().FirstOrDefaultAsync(f => f.Id == familyId, ct) ?? throw new NotFoundException();
            var members = await db.FamilyMembers.AsNoTracking().Where(m => m.FamilyId == familyId)
                .Select(m => new { m.Id, m.FullName, m.Gender, m.BirthDate, m.Status }).ToListAsync(ct);
            var rels = await db.Relationships.AsNoTracking().Where(r => r.FamilyId == familyId)
                .Select(r => new { r.MemberId1, r.MemberId2, r.RelationshipType }).ToListAsync(ct);
            return Results.Ok(new { exported_at = DateTimeOffset.UtcNow, version = 1, family = new { family.Id, family.Name }, members, relationships = rels });
        }).RequireAuthorization();
    }
}
