using MeningOilam.Api.Common;
using MeningOilam.Application.Abstractions;
using MeningOilam.Application.Auth;
using MeningOilam.Infrastructure.Auth;

namespace MeningOilam.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/auth");

        g.MapPost("/register", async (RegisterRequest req, AuthService auth, CancellationToken ct) =>
            Results.Ok(await auth.RegisterAsync(req, ct)));

        g.MapPost("/login", async (LoginRequest req, AuthService auth, CancellationToken ct) =>
            Results.Ok(await auth.LoginAsync(req, ct)));

        g.MapPost("/refresh", async (RefreshRequest req, AuthService auth, CancellationToken ct) =>
            Results.Ok(await auth.RefreshAsync(req.RefreshToken, ct)));

        g.MapPost("/logout", async (RefreshRequest req, AuthService auth, CancellationToken ct) =>
        {
            await auth.LogoutAsync(req.RefreshToken, ct);
            return Results.Ok(new { ok = true });
        });

        g.MapGet("/me", async (ICurrentUser user, AuthService auth, CancellationToken ct) =>
            Results.Ok(await auth.MeAsync(user.RequireUserId(), ct))).RequireAuthorization();

        // Telegram mini app — returns our own JWT tokens directly (no magic link).
        app.MapPost("/api/public/telegram/miniapp-auth-tokens", async (MiniAppAuthRequest req, AuthService auth, CancellationToken ct) =>
        {
            var (tokens, error) = await auth.MiniAppAuthAsync(req.InitData, ct);
            return error is null ? Results.Ok(tokens) : Results.BadRequest(new { error });
        });
    }
}
