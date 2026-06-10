using MeningOilam.Domain.Enums;

namespace MeningOilam.Domain.Entities;

/// <summary>Replaces Supabase auth.users. Owns credentials + identity.</summary>
public class AppUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Email { get; set; } = default!;
    public string? PasswordHash { get; set; }
    public string? DisplayName { get; set; }
    public bool EmailConfirmed { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Profile? Profile { get; set; }
    public List<UserRole> Roles { get; set; } = new();
    public List<RefreshToken> RefreshTokens { get; set; } = new();
}

/// <summary>Issued refresh tokens (rotation + revocation).</summary>
public class RefreshToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string TokenHash { get; set; } = default!;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? RevokedAt { get; set; }
    public string? ReplacedByTokenHash { get; set; }
    public AppUser? User { get; set; }

    public bool IsActive => RevokedAt is null && DateTimeOffset.UtcNow < ExpiresAt;
}

public class Profile
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string? Email { get; set; }
    public string? DisplayName { get; set; }
    public long? TelegramId { get; set; }
    public string? TelegramUsername { get; set; }
    public string? AvatarUrl { get; set; }
    public string? Language { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public AppUser? User { get; set; }
}

public class UserRole
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid? FamilyId { get; set; }
    public AppRole Role { get; set; } = AppRole.Member;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public AppUser? User { get; set; }
    public Family? Family { get; set; }
}
