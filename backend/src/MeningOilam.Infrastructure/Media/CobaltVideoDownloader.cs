using System.Net.Http.Json;
using System.Text.Json;
using MeningOilam.Application.Abstractions;
using MeningOilam.Infrastructure.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace MeningOilam.Infrastructure.Media;

/// <summary>
/// Resolves links via a self-hosted cobalt instance (https://github.com/imputnet/cobalt).
/// cobalt returns a clean, watermark/ad-free media URL — no third-party Telegram bots involved.
/// </summary>
public class CobaltVideoDownloader(HttpClient http, IOptions<CobaltOptions> options, ILogger<CobaltVideoDownloader> log)
    : IVideoDownloader
{
    private readonly CobaltOptions _o = options.Value;
    public bool Enabled => _o.Enabled;

    public async Task<VideoDownloadResult> ResolveAsync(string url, CancellationToken ct = default)
    {
        if (!Enabled) return VideoDownloadResult.Fail("cobalt_disabled");
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, _o.BaseUrl!.TrimEnd('/') + "/");
            req.Headers.TryAddWithoutValidation("Accept", "application/json");
            if (!string.IsNullOrWhiteSpace(_o.ApiKey))
                req.Headers.TryAddWithoutValidation("Authorization", $"Api-Key {_o.ApiKey}");
            req.Content = JsonContent.Create(new
            {
                url,
                videoQuality = _o.VideoQuality,
                filenameStyle = "basic",
                downloadMode = "auto",
            });

            using var res = await http.SendAsync(req, ct);
            var doc = await res.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
            var status = doc.TryGetProperty("status", out var s) ? s.GetString() : null;

            switch (status)
            {
                // Single media: cobalt either redirects to the source or tunnels through itself.
                case "redirect" or "tunnel" or "stream" or "success":
                {
                    var mediaUrl = doc.TryGetProperty("url", out var u) ? u.GetString() : null;
                    if (mediaUrl is null) return VideoDownloadResult.Fail("no_url");
                    var fn = doc.TryGetProperty("filename", out var f) ? f.GetString() : null;
                    return VideoDownloadResult.Ok(mediaUrl, fn);
                }
                // Multiple items (e.g. carousel) — take the first non-photo entry.
                case "picker":
                {
                    if (doc.TryGetProperty("picker", out var picker) && picker.ValueKind == JsonValueKind.Array)
                        foreach (var item in picker.EnumerateArray())
                        {
                            var type = item.TryGetProperty("type", out var ty) ? ty.GetString() : null;
                            var itemUrl = item.TryGetProperty("url", out var iu) ? iu.GetString() : null;
                            if (itemUrl is not null && type is not "photo")
                                return VideoDownloadResult.Ok(itemUrl, null);
                        }
                    return VideoDownloadResult.Fail("picker_no_video");
                }
                default:
                {
                    var err = doc.TryGetProperty("error", out var e) && e.TryGetProperty("code", out var c)
                        ? c.GetString() : status;
                    return VideoDownloadResult.Fail(err ?? "unknown");
                }
            }
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "cobalt resolve failed for {Url}", url);
            return VideoDownloadResult.Fail(ex.Message);
        }
    }
}
