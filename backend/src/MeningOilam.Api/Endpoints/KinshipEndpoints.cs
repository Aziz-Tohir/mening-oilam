using MeningOilam.Api.Common;
using MeningOilam.Application.Abstractions;
using MeningOilam.Application.Common;
using MeningOilam.Application.Kinship;
using MeningOilam.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace MeningOilam.Api.Endpoints;

public static class KinshipEndpoints
{
    public static void MapKinshipEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/families/{familyId:guid}/kinship", async (
            Guid familyId, Guid fromMemberId, Guid toMemberId,
            ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyMemberAsync(cu.RequireUserId(), familyId, ct);
            var edges = await db.Relationships.AsNoTracking().Where(r => r.FamilyId == familyId)
                .Select(r => new { r.MemberId1, r.MemberId2, r.RelationshipType }).ToListAsync(ct);
            var rows = edges.Select(e => new EdgeRow(e.MemberId1, e.MemberId2, Naming.ToSnake(e.RelationshipType))).ToList();
            var result = KinshipCalculator.Calculate(rows, fromMemberId, toMemberId);

            var names = await db.FamilyMembers.AsNoTracking()
                .Where(m => m.Id == fromMemberId || m.Id == toMemberId)
                .Select(m => new { m.Id, m.FullName }).ToListAsync(ct);
            string Name(Guid id) => names.FirstOrDefault(n => n.Id == id)?.FullName ?? "?";

            return Results.Ok(new
            {
                from = Name(fromMemberId), to = Name(toMemberId),
                result.Found, result.Type, result.Label,
                chain = result.Chain, path = result.Path,
            });
        }).RequireAuthorization();
    }
}
