using MeningOilam.Application.Abstractions;
using MeningOilam.Domain.Enums;
using MeningOilam.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace MeningOilam.Infrastructure.Auth;

public class FamilyAuthorization(AppDbContext db) : IFamilyAuthorization
{
    public Task<bool> IsGlobalSuperadminAsync(Guid userId, CancellationToken ct = default) =>
        db.UserRoles.AsNoTracking()
            .AnyAsync(r => r.UserId == userId && r.FamilyId == null && r.Role == AppRole.Superadmin, ct);

    public async Task<bool> IsFamilyAdminAsync(Guid userId, Guid familyId, CancellationToken ct = default) =>
        await db.UserRoles.AsNoTracking().AnyAsync(r => r.UserId == userId &&
            ((r.FamilyId == familyId && (r.Role == AppRole.Admin || r.Role == AppRole.Superadmin))
             || (r.FamilyId == null && r.Role == AppRole.Superadmin)), ct);

    public async Task<bool> IsFamilyMemberAsync(Guid userId, Guid familyId, CancellationToken ct = default) =>
        await db.UserRoles.AsNoTracking().AnyAsync(r => r.UserId == userId &&
            (r.FamilyId == familyId || (r.FamilyId == null && r.Role == AppRole.Superadmin)), ct);

    public async Task EnsureFamilyAdminAsync(Guid userId, Guid familyId, CancellationToken ct = default)
    {
        if (!await IsFamilyAdminAsync(userId, familyId, ct)) throw new ForbiddenException("Faqat oila admini uchun");
    }

    public async Task EnsureFamilyMemberAsync(Guid userId, Guid familyId, CancellationToken ct = default)
    {
        if (!await IsFamilyMemberAsync(userId, familyId, ct)) throw new ForbiddenException("Siz bu oila a'zosi emassiz");
    }

    public async Task EnsureGlobalSuperadminAsync(Guid userId, CancellationToken ct = default)
    {
        if (!await IsGlobalSuperadminAsync(userId, ct)) throw new ForbiddenException("Faqat superadmin uchun");
    }
}
