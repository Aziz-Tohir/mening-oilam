using MeningOilam.Api.Common;
using MeningOilam.Application.Abstractions;
using MeningOilam.Infrastructure.Configuration;
using MeningOilam.Infrastructure.Data;
using MeningOilam.Infrastructure.Jobs;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MeningOilam.Api.Endpoints;

public record SetWebhookBody(string Url);
public record SendTestBody(long ChatId, string Text);

/// <summary>Admin "Bot Control Center" — full bot oversight (superadmin only).</summary>
public static class BotControlEndpoints
{
    public static void MapBotControlEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/bot-control").RequireAuthorization();

        g.MapGet("/status", async (ICurrentUser cu, IFamilyAuthorization authz, ITelegramService tg, AppDbContext db,
            IOptions<TelegramOptions> tgo, IOptions<AiOptions> aio, IOptions<CobaltOptions> cobalt, JobRunner jobs, CancellationToken ct) =>
        {
            await authz.EnsureGlobalSuperadminAsync(cu.RequireUserId(), ct);
            var me = tg.Enabled ? await tg.GetMeAsync(ct) : null;
            var webhook = tg.Enabled ? await tg.GetWebhookInfoAsync(ct) : null;
            var state = await db.TelegramBotStates.AsNoTracking().FirstOrDefaultAsync(s => s.Id == 1, ct);
            var totalUpdates = await db.TelegramUpdatesRaw.CountAsync(ct);
            var errorUpdates = await db.TelegramUpdatesRaw.CountAsync(u => u.Error != null, ct);

            // Clean video relay stats
            var vidGroups = await db.VideoDownloadJobs.AsNoTracking()
                .GroupBy(j => j.Status).Select(grp => new { status = grp.Key, count = grp.Count() }).ToListAsync(ct);
            int VidCount(string s) => vidGroups.FirstOrDefault(g => g.status == s)?.count ?? 0;

            return Results.Ok(new
            {
                enabled = tg.Enabled,
                mode = tgo.Value.Mode,
                ai_enabled = aio.Value.Enabled,
                me, webhook,
                last_polled_at = state?.LastPolledAt,
                update_offset = state?.UpdateOffset,
                total_updates = totalUpdates,
                error_updates = errorUpdates,
                jobs = jobs.JobNames,
                video_downloads = new
                {
                    enabled = cobalt.Value.Enabled,
                    total = vidGroups.Sum(g => g.count),
                    done = VidCount("done"),
                    pending = VidCount("pending") + VidCount("processing"),
                    failed = VidCount("failed"),
                },
            });
        });

        g.MapPost("/webhook/set", async (SetWebhookBody body, ICurrentUser cu, IFamilyAuthorization authz, ITelegramService tg, IOptions<TelegramOptions> tgo, CancellationToken ct) =>
        {
            await authz.EnsureGlobalSuperadminAsync(cu.RequireUserId(), ct);
            await tg.SetWebhookAsync(body.Url, tgo.Value.WebhookSecret, ct);
            return Results.Ok(new { ok = true });
        });

        g.MapPost("/webhook/delete", async (ICurrentUser cu, IFamilyAuthorization authz, ITelegramService tg, CancellationToken ct) =>
        {
            await authz.EnsureGlobalSuperadminAsync(cu.RequireUserId(), ct);
            await tg.DeleteWebhookAsync(ct);
            return Results.Ok(new { ok = true });
        });

        g.MapPost("/send-test", async (SendTestBody body, ICurrentUser cu, IFamilyAuthorization authz, ITelegramService tg, CancellationToken ct) =>
        {
            await authz.EnsureGlobalSuperadminAsync(cu.RequireUserId(), ct);
            var id = await tg.SendMessageAsync(body.ChatId, body.Text, ct: ct);
            return Results.Ok(new { ok = id is not null, message_id = id });
        });

        g.MapGet("/jobs", async (ICurrentUser cu, IFamilyAuthorization authz, JobRunner jobs, IOptions<CronOptions> cron, CancellationToken ct) =>
        {
            await authz.EnsureGlobalSuperadminAsync(cu.RequireUserId(), ct);
            var schedules = new Dictionary<string, string>
            {
                ["daily-reminders"] = cron.Value.DailyReminders,
                ["process-join-requests"] = cron.Value.ProcessJoinRequests,
                ["sentiment-analysis"] = cron.Value.SentimentAnalysis,
                ["annual-awards"] = cron.Value.AnnualAwards,
            };
            return Results.Ok(new { jobs = jobs.JobNames, schedules, enabled = cron.Value.Enabled });
        });

        g.MapPost("/jobs/run/{name}", async (string name, ICurrentUser cu, IFamilyAuthorization authz, JobRunner jobs, CancellationToken ct) =>
        {
            await authz.EnsureGlobalSuperadminAsync(cu.RequireUserId(), ct);
            var result = await jobs.RunAsync(name, ct);
            return Results.Ok(new { ok = true, result });
        });

        // Recent clean-video-relay jobs — observability for the superadmin.
        g.MapGet("/video-jobs", async (int? limit, string? status, ICurrentUser cu, IFamilyAuthorization authz, AppDbContext db, CancellationToken ct) =>
        {
            await authz.EnsureGlobalSuperadminAsync(cu.RequireUserId(), ct);
            var take = limit is > 0 and <= 200 ? limit.Value : 50;
            var q = db.VideoDownloadJobs.AsNoTracking();
            if (!string.IsNullOrWhiteSpace(status)) q = q.Where(j => j.Status == status);
            var items = await q.OrderByDescending(j => j.CreatedAt).Take(take)
                .Select(j => new
                {
                    j.Id, j.FamilyId, j.ChatId, j.Url, j.Status, j.Error,
                    j.Attempts, j.ResultMessageId, j.CreatedAt, j.UpdatedAt,
                }).ToListAsync(ct);
            return Results.Ok(new { items });
        });
    }
}
