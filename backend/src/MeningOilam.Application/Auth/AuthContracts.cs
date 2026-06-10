namespace MeningOilam.Application.Auth;

public record RegisterRequest(string Email, string Password, string? DisplayName);
public record LoginRequest(string Email, string Password);
public record RefreshRequest(string RefreshToken);
public record MiniAppAuthRequest(string InitData);
public record MiniAppRegisterRequest(string InitData, string InviteCode);

public record AuthTokens(string AccessToken, string RefreshToken, long ExpiresIn);

public record RoleInfo(string Role, Guid? FamilyId);
public record MeResponse(Guid UserId, string Email, string? DisplayName, long? TelegramId,
    string Role, Guid? FamilyId, IReadOnlyList<RoleInfo> Roles);
