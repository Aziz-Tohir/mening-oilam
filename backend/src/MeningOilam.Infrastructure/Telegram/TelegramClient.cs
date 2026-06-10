using System.Net.Http.Json;
using System.Text.Json;
using MeningOilam.Infrastructure.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace MeningOilam.Infrastructure.Telegram;

/// <summary>Thin, version-proof wrapper over the raw Telegram Bot HTTP API (api.telegram.org).</summary>
public class TelegramClient(HttpClient http, IOptions<TelegramOptions> options, ILogger<TelegramClient> log)
{
    private readonly TelegramOptions _o = options.Value;
    public bool Enabled => _o.Enabled;
    public string? BotUsername => _o.BotUsername;

    private string Base => $"https://api.telegram.org/bot{_o.BotToken}";
    private string FileBase => $"https://api.telegram.org/file/bot{_o.BotToken}";

    public async Task<JsonElement?> CallAsync(string method, object? body = null, CancellationToken ct = default)
    {
        if (!Enabled) { log.LogWarning("Telegram disabled (no BotToken); skipping {Method}", method); return null; }
        try
        {
            using var res = await http.PostAsJsonAsync($"{Base}/{method}", body ?? new { }, ct);
            var doc = await res.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
            if (!doc.TryGetProperty("ok", out var ok) || !ok.GetBoolean())
            {
                log.LogWarning("Telegram {Method} failed: {Body}", method, doc.ToString());
                return null;
            }
            return doc.TryGetProperty("result", out var result) ? result : doc;
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "Telegram {Method} threw", method);
            return null;
        }
    }

    /// <summary>Throws on Telegram-side errors so callers (e.g. broadcast) can react to 429 retry_after.</summary>
    public async Task<JsonElement> CallOrThrowAsync(string method, object? body = null, CancellationToken ct = default)
    {
        if (!Enabled) throw new InvalidOperationException("Telegram bot token not configured");
        using var res = await http.PostAsJsonAsync($"{Base}/{method}", body ?? new { }, ct);
        var doc = await res.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        if (!doc.TryGetProperty("ok", out var ok) || !ok.GetBoolean())
            throw new TelegramApiException(method, doc);
        return doc.TryGetProperty("result", out var result) ? result : doc;
    }

    /// <summary>Multipart variant of <see cref="CallAsync"/> for uploading files (e.g. sendVideo).</summary>
    public async Task<JsonElement?> CallMultipartAsync(string method, MultipartFormDataContent content, CancellationToken ct = default)
    {
        if (!Enabled) { log.LogWarning("Telegram disabled (no BotToken); skipping {Method}", method); return null; }
        try
        {
            using var res = await http.PostAsync($"{Base}/{method}", content, ct);
            var doc = await res.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
            if (!doc.TryGetProperty("ok", out var ok) || !ok.GetBoolean())
            {
                log.LogWarning("Telegram {Method} (multipart) failed: {Body}", method, doc.ToString());
                return null;
            }
            return doc.TryGetProperty("result", out var result) ? result : doc;
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "Telegram {Method} (multipart) threw", method);
            return null;
        }
    }

    public async Task<byte[]?> DownloadFileAsync(string fileId, CancellationToken ct = default)
    {
        var fileRes = await CallAsync("getFile", new { file_id = fileId }, ct);
        if (fileRes is null || !fileRes.Value.TryGetProperty("file_path", out var fp)) return null;
        var path = fp.GetString();
        if (path is null) return null;
        return await http.GetByteArrayAsync($"{FileBase}/{path}", ct);
    }
}

public class TelegramApiException : Exception
{
    public int? RetryAfter { get; }
    public TelegramApiException(string method, JsonElement body) : base($"Telegram {method} failed: {body}")
    {
        if (body.TryGetProperty("parameters", out var p) && p.TryGetProperty("retry_after", out var ra))
            RetryAfter = ra.GetInt32();
    }
}
