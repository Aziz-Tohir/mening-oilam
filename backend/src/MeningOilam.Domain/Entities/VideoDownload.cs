namespace MeningOilam.Domain.Entities;

/// <summary>
/// A queued request to download a clean copy of a video from a link posted in a family group.
/// The bot resolves the link via the configured downloader (cobalt), uploads a watermark/ad-free
/// copy back to the group as a reply, and optionally deletes the original link message.
/// </summary>
public class VideoDownloadJob
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FamilyId { get; set; }

    /// <summary>Telegram chat the link was posted in (and where the clean video is sent back).</summary>
    public long ChatId { get; set; }

    /// <summary>Topic (forum thread) id, if the group is topic-based.</summary>
    public int? ThreadId { get; set; }

    /// <summary>Message id of the user's original link message (reply target).</summary>
    public int OriginalMessageId { get; set; }

    public long RequesterTelegramId { get; set; }
    public string Url { get; set; } = default!;

    /// <summary>pending | processing | done | failed.</summary>
    public string Status { get; set; } = "pending";
    public string? Error { get; set; }
    public int Attempts { get; set; }

    /// <summary>Message id of the clean video the bot posted, once done.</summary>
    public int? ResultMessageId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
