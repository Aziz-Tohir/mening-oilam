namespace MeningOilam.Application.Abstractions;

public record TgButton(string Text, string? CallbackData = null, string? Url = null, string? WebAppUrl = null);

/// <summary>High-level Telegram operations used by API endpoints and cron jobs.
/// The bot's update-processing pipeline uses the lower-level client directly.</summary>
public interface ITelegramService
{
    bool Enabled { get; }

    Task<int?> SendMessageAsync(long chatId, string text, IReadOnlyList<IReadOnlyList<TgButton>>? keyboard = null,
        string? parseMode = "HTML", int? threadId = null, bool disableNotification = false, CancellationToken ct = default);

    /// <summary>Uploads a video (multipart) and returns the sent message id, optionally replying in a topic.</summary>
    Task<int?> SendVideoAsync(long chatId, byte[] video, string fileName, string? caption = null,
        string? parseMode = "HTML", int? replyToMessageId = null, int? threadId = null, CancellationToken ct = default);

    Task DeleteMessageAsync(long chatId, int messageId, CancellationToken ct = default);
    Task BanAsync(long chatId, long userId, CancellationToken ct = default);
    Task UnbanAsync(long chatId, long userId, CancellationToken ct = default);
    Task<bool> RestrictAsync(long chatId, long userId, DateTimeOffset? until = null, CancellationToken ct = default);
    Task UnrestrictAsync(long chatId, long userId, CancellationToken ct = default);
    Task<string?> CreateInviteLinkAsync(long chatId, int? memberLimit = null, CancellationToken ct = default);
    Task<bool> IsChatAdminAsync(long chatId, long userId, CancellationToken ct = default);

    /// <summary>Webhook management for the admin control center.</summary>
    Task SetWebhookAsync(string url, string? secret, CancellationToken ct = default);
    Task DeleteWebhookAsync(CancellationToken ct = default);
    Task<object?> GetWebhookInfoAsync(CancellationToken ct = default);
    Task<object?> GetMeAsync(CancellationToken ct = default);
}
