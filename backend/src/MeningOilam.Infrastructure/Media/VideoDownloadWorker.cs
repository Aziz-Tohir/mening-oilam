using MeningOilam.Application.Abstractions;
using MeningOilam.Infrastructure.Caching;
using MeningOilam.Infrastructure.Configuration;
using MeningOilam.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace MeningOilam.Infrastructure.Media;

/// <summary>
/// Consumes queued <c>VideoDownloadJob</c>s: resolves the link via the downloader, fetches the
/// media bytes (size-capped), uploads a clean copy to the group as a reply, and optionally
/// deletes the original link message. Runs off the webhook hot path.
/// </summary>
public class VideoDownloadWorker(
    IServiceScopeFactory scopeFactory,
    VideoDownloadQueue queue,
    IHttpClientFactory httpFactory,
    IOptions<CobaltOptions> cobaltOptions,
    ILogger<VideoDownloadWorker> log) : BackgroundService
{
    private readonly CobaltOptions _cobalt = cobaltOptions.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_cobalt.Enabled)
        {
            log.LogInformation("Video download disabled (no Cobalt:BaseUrl configured)");
            return;
        }

        log.LogInformation("Video download worker started (cobalt={BaseUrl})", _cobalt.BaseUrl);
        await SweepPendingAsync(stoppingToken);

        await foreach (var jobId in queue.ReadAllAsync(stoppingToken))
        {
            try { await ProcessAsync(jobId, stoppingToken); }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { log.LogError(ex, "Video job {Id} crashed", jobId); }
        }
    }

    /// <summary>On startup, re-enqueue jobs left pending/processing by a previous run.</summary>
    private async Task SweepPendingAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var ids = await db.VideoDownloadJobs
            .Where(j => j.Status == "pending" || j.Status == "processing")
            .OrderBy(j => j.CreatedAt).Select(j => j.Id).ToListAsync(ct);
        foreach (var id in ids) await queue.EnqueueAsync(id, ct);
        if (ids.Count > 0) log.LogInformation("Re-enqueued {N} pending video jobs", ids.Count);
    }

    private async Task ProcessAsync(Guid jobId, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var downloader = scope.ServiceProvider.GetRequiredService<IVideoDownloader>();
        var tg = scope.ServiceProvider.GetRequiredService<ITelegramService>();
        var cache = scope.ServiceProvider.GetRequiredService<BotCache>();

        var job = await db.VideoDownloadJobs.FirstOrDefaultAsync(j => j.Id == jobId, ct);
        if (job is null || job.Status == "done") return;

        job.Status = "processing";
        job.Attempts++;
        await db.SaveChangesAsync(ct);

        // 1) Resolve link → clean media URL
        var resolved = await downloader.ResolveAsync(job.Url, ct);
        if (!resolved.Success || resolved.MediaUrl is null)
        {
            job.Status = "failed";
            job.Error = resolved.Error;
            await db.SaveChangesAsync(ct);
            log.LogInformation("Video resolve failed for job {Id}: {Error}", job.Id, resolved.Error);
            return;
        }

        // 2) Download bytes with a hard size cap (Telegram Bot API upload limit is 50 MB)
        var cap = (long)_cobalt.MaxFileSizeMb * 1024 * 1024;
        byte[]? bytes;
        try
        {
            var http = httpFactory.CreateClient("cobalt-media");
            bytes = await DownloadCappedAsync(http, resolved.MediaUrl, cap, ct);
        }
        catch (Exception ex)
        {
            job.Status = "failed";
            job.Error = "download: " + ex.Message;
            await db.SaveChangesAsync(ct);
            return;
        }

        if (bytes is null)
        {
            // Too large to re-upload — give the user the clean direct link as a fallback.
            await tg.SendMessageAsync(job.ChatId,
                $"🎬 Video {_cobalt.MaxFileSizeMb}MB dan katta, shu sababli to'g'ridan-to'g'ri havola:\n{resolved.MediaUrl}",
                threadId: job.ThreadId, ct: ct);
            job.Status = "failed";
            job.Error = "too_large";
            await db.SaveChangesAsync(ct);
            return;
        }

        // 3) Send the clean video back as a reply to the original link message
        var fileName = string.IsNullOrWhiteSpace(resolved.FileName) ? "video.mp4" : resolved.FileName!;
        var msgId = await tg.SendVideoAsync(job.ChatId, bytes, fileName,
            caption: null, replyToMessageId: job.OriginalMessageId, threadId: job.ThreadId, ct: ct);

        job.ResultMessageId = msgId;
        job.Status = msgId is not null ? "done" : "failed";
        if (msgId is null) job.Error = "send_failed";
        await db.SaveChangesAsync(ct);

        // 4) Optionally remove the original link message to keep the group clean
        if (msgId is not null)
        {
            var settings = await cache.GetFamilySettingsAsync(job.FamilyId, ct);
            if (settings?.VideoDownloadDeleteOriginal == true)
                await tg.DeleteMessageAsync(job.ChatId, job.OriginalMessageId, ct);
        }
    }

    /// <summary>Streams the response into memory, aborting if it exceeds <paramref name="cap"/> bytes.</summary>
    private static async Task<byte[]?> DownloadCappedAsync(HttpClient http, string url, long cap, CancellationToken ct)
    {
        using var res = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        res.EnsureSuccessStatusCode();
        if (res.Content.Headers.ContentLength is { } len && len > cap) return null;

        await using var stream = await res.Content.ReadAsStreamAsync(ct);
        using var ms = new MemoryStream();
        var buffer = new byte[81920];
        int read;
        while ((read = await stream.ReadAsync(buffer, ct)) > 0)
        {
            if (ms.Length + read > cap) return null;
            ms.Write(buffer, 0, read);
        }
        return ms.ToArray();
    }
}
