namespace MeningOilam.Application.Abstractions;

/// <summary>Result of resolving a media link to a direct, clean (no-watermark/no-ad) media URL.</summary>
public record VideoDownloadResult(
    bool Success,
    string? MediaUrl = null,
    string? FileName = null,
    string? Title = null,
    string? Error = null)
{
    public static VideoDownloadResult Fail(string error) => new(false, Error: error);
    public static VideoDownloadResult Ok(string mediaUrl, string? fileName, string? title = null) =>
        new(true, mediaUrl, fileName, title);
}

/// <summary>
/// Resolves a public video link (YouTube, Instagram, TikTok, ...) into a direct media URL
/// stripped of platform clutter. Implemented by a pluggable backend (cobalt by default).
/// </summary>
public interface IVideoDownloader
{
    bool Enabled { get; }
    Task<VideoDownloadResult> ResolveAsync(string url, CancellationToken ct = default);
}
