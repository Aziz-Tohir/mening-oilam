using MeningOilam.Application.Abstractions;
using MeningOilam.Application.Auth;
using MeningOilam.Domain.Entities;
using MeningOilam.Domain.Enums;
using MeningOilam.Infrastructure.Configuration;
using MeningOilam.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MeningOilam.Infrastructure.Auth;

public class AuthService(
    AppDbContext db,
    JwtTokenService jwt,
    IOptions<TelegramOptions> tg)
{
    public async Task<AuthTokens> RegisterAsync(RegisterRequest req, CancellationToken ct)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@')) throw new ValidationException("Email noto'g'ri");
        if (req.Password.Length < 6) throw new ValidationException("Parol kamida 6 belgi bo'lishi kerak");
        if (await db.Users.AnyAsync(u => u.Email == email, ct)) throw new ValidationException("Bu email allaqachon ro'yxatdan o'tgan");

        var user = new AppUser
        {
            Email = email,
            DisplayName = req.DisplayName,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            EmailConfirmed = true,
        };
        db.Users.Add(user);
        // handle_new_user trigger replacement: create the profile row.
        db.Profiles.Add(new Profile { UserId = user.Id, Email = email, DisplayName = req.DisplayName ?? email });
        await db.SaveChangesAsync(ct);

        return await IssueTokensAsync(user, ct);
    }

    public async Task<AuthTokens> LoginAsync(LoginRequest req, CancellationToken ct)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);
        if (user?.PasswordHash is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            throw new ForbiddenException("Email yoki parol noto'g'ri");
        return await IssueTokensAsync(user, ct);
    }

    public async Task<AuthTokens> RefreshAsync(string refreshToken, CancellationToken ct)
    {
        var hash = JwtTokenService.Hash(refreshToken);
        var token = await db.RefreshTokens.Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (token is null || !token.IsActive || token.User is null) throw new ForbiddenException("Refresh token yaroqsiz");

        token.RevokedAt = DateTimeOffset.UtcNow;
        var tokens = await IssueTokensAsync(token.User, ct);
        token.ReplacedByTokenHash = JwtTokenService.Hash(tokens.RefreshToken);
        await db.SaveChangesAsync(ct);
        return tokens;
    }

    public async Task LogoutAsync(string refreshToken, CancellationToken ct)
    {
        var hash = JwtTokenService.Hash(refreshToken);
        var token = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (token is { RevokedAt: null }) { token.RevokedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(ct); }
    }

    public async Task<MeResponse> MeAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId, ct)
                   ?? throw new NotFoundException("Foydalanuvchi topilmadi");
        var profile = await db.Profiles.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == userId, ct);
        var (top, familyId, roles) = await ResolveRolesAsync(userId, ct);
        return new MeResponse(user.Id, user.Email, user.DisplayName, profile?.TelegramId,
            top, familyId, roles);
    }

    // ---- Telegram mini app ----

    public async Task<(AuthTokens? tokens, string? error)> MiniAppAuthAsync(string initData, CancellationToken ct)
    {
        var info = TelegramInitData.Validate(initData, tg.Value.BotToken ?? "", TimeSpan.FromHours(24));
        if (info is null) return (null, "invalid_init_data");

        var member = await db.FamilyMembers.AsNoTracking()
            .FirstOrDefaultAsync(m => m.TelegramId == info.Id && m.Status == MemberStatus.Active, ct);
        if (member is null)
        {
            var pendingMember = await db.FamilyMembers.AsNoTracking()
                .FirstOrDefaultAsync(m => m.TelegramId == info.Id, ct);
            if (pendingMember is { Status: MemberStatus.Pending }) return (null, "pending");
            return (null, "not_registered");
        }

        var user = await EnsureUserForTelegramAsync(info, member, ct);
        return (await IssueTokensAsync(user, ct), null);
    }

    public async Task<(bool ok, string? familyName, bool alreadyMember, string? error)> MiniAppRegisterAsync(
        string initData, string inviteCode, CancellationToken ct)
    {
        var info = TelegramInitData.Validate(initData, tg.Value.BotToken ?? "", TimeSpan.FromHours(24));
        if (info is null) return (false, null, false, "invalid_init_data");

        var family = await db.Families.AsNoTracking()
            .FirstOrDefaultAsync(f => f.InviteCode == inviteCode.Trim().ToUpperInvariant(), ct);
        if (family is null) return (false, null, false, "invalid_code");

        var existing = await db.FamilyMembers.AsNoTracking()
            .FirstOrDefaultAsync(m => m.FamilyId == family.Id && m.TelegramId == info.Id, ct);
        if (existing is { Status: MemberStatus.Active }) return (true, family.Name, true, null);

        var open = await db.JoinRequests.FirstOrDefaultAsync(j => j.FamilyId == family.Id &&
            j.ApplicantTelegramId == info.Id &&
            (j.Status == JoinRequestStatus.AwaitingAdminApproval || j.Status == JoinRequestStatus.AwaitingRelativeChoice), ct);
        if (open is null)
        {
            db.JoinRequests.Add(new JoinRequest
            {
                FamilyId = family.Id,
                ApplicantTelegramId = info.Id,
                ApplicantUsername = info.Username,
                ApplicantFullName = $"{info.FirstName} {info.LastName}".Trim(),
                Status = JoinRequestStatus.AwaitingAdminApproval,
            });
            db.ActionLogs.Add(new ActionLog { FamilyId = family.Id, ActorTelegramId = info.Id, Action = "miniapp_join_request" });
            await db.SaveChangesAsync(ct);
        }
        return (true, family.Name, false, null);
    }

    // ---- helpers ----

    private async Task<AppUser> EnsureUserForTelegramAsync(TelegramUserInfo info, FamilyMember member, CancellationToken ct)
    {
        var profile = await db.Profiles.FirstOrDefaultAsync(p => p.TelegramId == info.Id, ct);
        AppUser user;
        if (profile is not null)
        {
            user = await db.Users.FirstAsync(u => u.Id == profile.UserId, ct);
        }
        else
        {
            user = new AppUser
            {
                Email = $"tg{info.Id}@telegram.local",
                DisplayName = member.FullName,
                EmailConfirmed = true,
            };
            db.Users.Add(user);
            db.Profiles.Add(new Profile
            {
                UserId = user.Id, Email = user.Email, DisplayName = member.FullName,
                TelegramId = info.Id, TelegramUsername = info.Username,
            });
            await db.SaveChangesAsync(ct);
        }

        // Ensure a member role for this family + link the family_member to this user.
        if (!await db.UserRoles.AnyAsync(r => r.UserId == user.Id && r.FamilyId == member.FamilyId, ct))
            db.UserRoles.Add(new UserRole { UserId = user.Id, FamilyId = member.FamilyId, Role = AppRole.Member });
        var liveMember = await db.FamilyMembers.FirstOrDefaultAsync(m => m.Id == member.Id, ct);
        if (liveMember is { UserId: null }) liveMember.UserId = user.Id;
        await db.SaveChangesAsync(ct);
        return user;
    }

    private async Task<AuthTokens> IssueTokensAsync(AppUser user, CancellationToken ct)
    {
        var (top, familyId, _) = await ResolveRolesAsync(user.Id, ct);
        var (access, expiresIn) = jwt.CreateAccessToken(user, top, familyId);
        var (raw, hash, expires) = jwt.CreateRefreshToken();
        db.RefreshTokens.Add(new RefreshToken { UserId = user.Id, TokenHash = hash, ExpiresAt = expires });
        await db.SaveChangesAsync(ct);
        return new AuthTokens(access, raw, expiresIn);
    }

    private async Task<(string top, Guid? familyId, IReadOnlyList<RoleInfo> roles)> ResolveRolesAsync(Guid userId, CancellationToken ct)
    {
        var roles = await db.UserRoles.AsNoTracking().Where(r => r.UserId == userId)
            .Select(r => new { r.Role, r.FamilyId }).ToListAsync(ct);
        if (roles.Count == 0) return ("member", null, Array.Empty<RoleInfo>());

        int Rank(AppRole r) => r switch { AppRole.Superadmin => 3, AppRole.Admin => 2, _ => 1 };
        var ordered = roles.OrderByDescending(r => Rank(r.Role)).ToList();
        var topRole = ordered[0].Role.ToString().ToLowerInvariant();
        var familyId = ordered.FirstOrDefault(r => r.FamilyId != null)?.FamilyId;
        var list = ordered.Select(r => new RoleInfo(r.Role.ToString().ToLowerInvariant(), r.FamilyId)).ToList();
        return (topRole, familyId, list);
    }
}
