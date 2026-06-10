using MeningOilam.Api.Common;
using MeningOilam.Application.Abstractions;
using MeningOilam.Domain.Entities;
using MeningOilam.Domain.Enums;
using MeningOilam.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace MeningOilam.Api.Endpoints;

public record AddMemberRequest(string FullName, long TelegramId, string? Username, string? Gender, DateOnly? BirthDate, string? Phone);
public record UpdateMemberRequest(string? FullName, string? Gender, DateOnly? BirthDate, string? Phone, string? Bio, bool? PhotoIsPrivate, string? PhotoUrl);

public static class MemberEndpoints
{
    public static void MapMemberEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/families/{familyId:guid}/members").RequireAuthorization();

        g.MapGet("/", async (Guid familyId, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyMemberAsync(cu.RequireUserId(), familyId, ct);
            var settings = await db.FamilySettings.AsNoTracking().FirstOrDefaultAsync(s => s.FamilyId == familyId, ct);
            var policy = settings?.FemalePhotoVisibility ?? "public";
            var members = await db.FamilyMembers.AsNoTracking().Where(m => m.FamilyId == familyId)
                .OrderBy(m => m.FullName).ToListAsync(ct);

            var result = members.Select(m => new
            {
                m.Id, m.TelegramId, m.Username, m.FullName, m.Gender, m.BirthDate, m.Phone, m.Bio,
                photo_url = PhotoHidden(m, policy) ? null : m.PhotoUrl,
                photo_hidden = PhotoHidden(m, policy),
                m.Status, m.SentimentOptOut, m.JoinedAt, m.UserId,
            });
            return Results.Ok(new { members = result });
        });

        g.MapPost("/", async (Guid familyId, AddMemberRequest req, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            var member = new FamilyMember
            {
                FamilyId = familyId, FullName = req.FullName, TelegramId = req.TelegramId,
                Username = req.Username, Phone = req.Phone, BirthDate = req.BirthDate,
                Gender = ParseGender(req.Gender), Status = MemberStatus.Active,
            };
            db.FamilyMembers.Add(member);
            db.ActionLogs.Add(new ActionLog { FamilyId = familyId, ActorUserId = cu.UserId, Action = "member_added_manually" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { id = member.Id });
        });

        g.MapPatch("/{memberId:guid}", async (Guid familyId, Guid memberId, UpdateMemberRequest req, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            var m = await db.FamilyMembers.FirstOrDefaultAsync(x => x.Id == memberId && x.FamilyId == familyId, ct) ?? throw new NotFoundException();
            if (req.FullName is not null) m.FullName = req.FullName;
            if (req.Gender is not null) m.Gender = ParseGender(req.Gender);
            if (req.BirthDate is not null) m.BirthDate = req.BirthDate;
            if (req.Phone is not null) m.Phone = req.Phone;
            if (req.Bio is not null) m.Bio = req.Bio;
            if (req.PhotoIsPrivate is not null) m.PhotoIsPrivate = req.PhotoIsPrivate.Value;
            if (req.PhotoUrl is not null) m.PhotoUrl = req.PhotoUrl;
            db.ActionLogs.Add(new ActionLog { FamilyId = familyId, ActorUserId = cu.UserId, Action = "member_updated" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        });

        g.MapPost("/{memberId:guid}/status", async (Guid familyId, Guid memberId, StatusBody body, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            var m = await db.FamilyMembers.FirstOrDefaultAsync(x => x.Id == memberId && x.FamilyId == familyId, ct) ?? throw new NotFoundException();
            m.Status = Enum.Parse<MemberStatus>(body.Status, true);
            db.ActionLogs.Add(new ActionLog { FamilyId = familyId, ActorUserId = cu.UserId, Action = "member_status_changed" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        });

        // Join requests (admin read-only list)
        app.MapGet("/api/families/{familyId:guid}/join-requests", async (Guid familyId, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            var requests = await db.JoinRequests.AsNoTracking().Where(j => j.FamilyId == familyId)
                .OrderByDescending(j => j.CreatedAt)
                .Select(j => new { j.Id, j.ApplicantTelegramId, j.ApplicantUsername, j.ApplicantFullName, j.Status, j.RelationshipType, j.CreatedAt })
                .ToListAsync(ct);
            return Results.Ok(new { requests });
        }).RequireAuthorization();
    }

    public record StatusBody(string Status);

    private static bool PhotoHidden(FamilyMember m, string policy)
    {
        if (m.Gender != GenderType.Female) return false;
        return policy switch
        {
            "always_hidden" => true,
            "female_only" => true,
            "private_default" => m.PhotoIsPrivate,
            _ => m.PhotoIsPrivate,
        };
    }

    private static GenderType? ParseGender(string? g) =>
        g is null ? null : Enum.TryParse<GenderType>(g, true, out var v) ? v : null;
}
