namespace MeningOilam.Application.Abstractions;

/// <summary>Resolves the authenticated user for the current request.</summary>
public interface ICurrentUser
{
    Guid? UserId { get; }
    bool IsAuthenticated { get; }
}

/// <summary>Replaces Supabase RLS helper functions (is_family_admin / is_family_member / is_global_superadmin).</summary>
public interface IFamilyAuthorization
{
    Task<bool> IsGlobalSuperadminAsync(Guid userId, CancellationToken ct = default);
    Task<bool> IsFamilyAdminAsync(Guid userId, Guid familyId, CancellationToken ct = default);
    Task<bool> IsFamilyMemberAsync(Guid userId, Guid familyId, CancellationToken ct = default);
    Task EnsureFamilyAdminAsync(Guid userId, Guid familyId, CancellationToken ct = default);
    Task EnsureFamilyMemberAsync(Guid userId, Guid familyId, CancellationToken ct = default);
    Task EnsureGlobalSuperadminAsync(Guid userId, CancellationToken ct = default);
}

public class ForbiddenException(string message = "Forbidden") : Exception(message);
public class NotFoundException(string message = "Not found") : Exception(message);
public class ValidationException(string message) : Exception(message);

/// <summary>File storage abstraction (avatars, memories).</summary>
public interface IFileStorage
{
    Task<string> SaveAsync(string keyPrefix, string fileName, Stream content, string contentType, CancellationToken ct = default);
    Task DeleteAsync(string url, CancellationToken ct = default);
}

/// <summary>Pluggable sentiment scoring. Returns score in [-1, 1] per telegram_id.</summary>
public interface ISentimentAnalyzer
{
    bool Enabled { get; }
    Task<IReadOnlyDictionary<long, double>> ScoreAsync(IReadOnlyList<SentimentInput> inputs, CancellationToken ct = default);
}

public record SentimentInput(long TelegramId, IReadOnlyList<string> Messages);

/// <summary>Localized strings (uz / uz_cyrl / ru / en).</summary>
public interface ILocalizer
{
    string T(string key, string? lang = null, IReadOnlyDictionary<string, string>? vars = null);
}
