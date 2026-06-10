using System.Text.Json;
using MeningOilam.Application.Auth;
using MeningOilam.Infrastructure.Auth;
using MeningOilam.Infrastructure.Bot;
using MeningOilam.Infrastructure.Configuration;
using MeningOilam.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MeningOilam.Api.Endpoints;

public static class PublicTelegramEndpoints
{
    public static void MapPublicTelegramEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/public/telegram");

        // Webhook (Telegram → us). Validated by secret token header.
        g.MapPost("/webhook", async (HttpRequest request, JsonElement update, BotUpdateProcessor processor,
            AppDbContext db, IOptions<TelegramOptions> tg, CancellationToken ct) =>
        {
            var secret = tg.Value.WebhookSecret;
            if (!string.IsNullOrEmpty(secret) &&
                request.Headers["X-Telegram-Bot-Api-Secret-Token"].ToString() != secret)
                return Results.Unauthorized();

            var updateId = update.TryGetProperty("update_id", out var idEl) ? idEl.GetInt64() : 0;
            if (updateId != 0 && !await db.TelegramUpdatesRaw.AnyAsync(u => u.UpdateId == updateId, ct))
            {
                db.TelegramUpdatesRaw.Add(new Domain.Entities.TelegramUpdateRaw { UpdateId = updateId, Payload = JsonDocument.Parse(update.GetRawText()) });
                await db.SaveChangesAsync(ct);
            }
            try
            {
                await processor.ProcessAsync(update, ct);
                if (updateId != 0)
                {
                    var raw = await db.TelegramUpdatesRaw.FirstOrDefaultAsync(u => u.UpdateId == updateId, ct);
                    if (raw is not null) { raw.ProcessedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(ct); }
                }
            }
            catch (Exception ex)
            {
                if (updateId != 0)
                {
                    var raw = await db.TelegramUpdatesRaw.FirstOrDefaultAsync(u => u.UpdateId == updateId, ct);
                    if (raw is not null) { raw.Error = ex.Message; await db.SaveChangesAsync(ct); }
                }
            }
            return Results.Ok(new { ok = true });
        });

        // Mini app auth → returns our JWT tokens
        g.MapPost("/miniapp-auth", async (MiniAppAuthRequest req, AuthService auth, CancellationToken ct) =>
        {
            var (tokens, error) = await auth.MiniAppAuthAsync(req.InitData, ct);
            return error is null ? Results.Ok(tokens) : Results.BadRequest(new { error });
        });

        g.MapPost("/miniapp-register", async (MiniAppRegisterRequest req, AuthService auth, CancellationToken ct) =>
        {
            var (ok, familyName, alreadyMember, error) = await auth.MiniAppRegisterAsync(req.InitData, req.InviteCode, ct);
            return ok ? Results.Ok(new { ok, family_name = familyName, already_member = alreadyMember }) : Results.BadRequest(new { error });
        });
    }
}
