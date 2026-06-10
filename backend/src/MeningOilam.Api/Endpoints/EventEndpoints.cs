using MeningOilam.Api.Common;
using MeningOilam.Application.Abstractions;
using MeningOilam.Domain.Entities;
using MeningOilam.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace MeningOilam.Api.Endpoints;

public record CreateEventRequest(string Title, string? Description, DateTimeOffset EventAt, string? Location,
    bool IsRecurringYearly, int[]? NotifyDaysBefore, bool NotifyGroup);

public record PatchEventRequest(string? Title, string? Description, DateTimeOffset? EventAt, string? Location,
    bool? IsRecurringYearly, int[]? NotifyDaysBefore, bool? NotifyGroup);

public static class EventEndpoints
{
    public static void MapEventEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/families/{familyId:guid}/events").RequireAuthorization();

        g.MapGet("/", async (Guid familyId, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyMemberAsync(cu.RequireUserId(), familyId, ct);
            var events = await db.Events.AsNoTracking().Where(e => e.FamilyId == familyId)
                .OrderBy(e => e.EventAt).ToListAsync(ct);
            return Results.Ok(new { events });
        });

        g.MapPost("/", async (Guid familyId, CreateEventRequest req, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            var ev = new Event
            {
                FamilyId = familyId, Title = req.Title, Description = req.Description, EventAt = req.EventAt,
                Location = req.Location, IsRecurringYearly = req.IsRecurringYearly,
                NotifyDaysBefore = req.NotifyDaysBefore ?? new[] { 7, 1, 0 }, NotifyGroup = req.NotifyGroup,
                CreatedBy = cu.UserId,
            };
            db.Events.Add(ev);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { id = ev.Id });
        });

        g.MapPatch("/{id:guid}", async (Guid familyId, Guid id, PatchEventRequest req, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == id && e.FamilyId == familyId, ct)
                     ?? throw new NotFoundException();
            if (req.Title is not null) ev.Title = req.Title;
            if (req.Description is not null) ev.Description = req.Description;
            if (req.Location is not null) ev.Location = req.Location;
            if (req.EventAt is not null) ev.EventAt = req.EventAt.Value;
            if (req.IsRecurringYearly is not null) ev.IsRecurringYearly = req.IsRecurringYearly.Value;
            if (req.NotifyGroup is not null) ev.NotifyGroup = req.NotifyGroup.Value;
            if (req.NotifyDaysBefore is not null) ev.NotifyDaysBefore = req.NotifyDaysBefore;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        });

        g.MapDelete("/{id:guid}", async (Guid familyId, Guid id, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            await db.Events.Where(e => e.Id == id && e.FamilyId == familyId).ExecuteDeleteAsync(ct);
            return Results.Ok(new { ok = true });
        });

        // Upcoming birthdays
        app.MapGet("/api/families/{familyId:guid}/birthdays", async (Guid familyId, int days, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyMemberAsync(cu.RequireUserId(), familyId, ct);
            if (days <= 0) days = 30;
            var members = await db.FamilyMembers.AsNoTracking()
                .Where(m => m.FamilyId == familyId && m.BirthDate != null).ToListAsync(ct);
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var items = members.Select(m =>
            {
                var bd = m.BirthDate!.Value;
                var next = new DateOnly(today.Year, bd.Month, Math.Min(bd.Day, DateTime.DaysInMonth(today.Year, bd.Month)));
                if (next < today) next = next.AddYears(1);
                return new { m.Id, m.FullName, birth_date = bd, next_birthday = next, days_until = next.DayNumber - today.DayNumber, turning_age = next.Year - bd.Year };
            }).Where(x => x.days_until <= days).OrderBy(x => x.days_until).ToList();
            return Results.Ok(new { items });
        }).RequireAuthorization();
    }
}
