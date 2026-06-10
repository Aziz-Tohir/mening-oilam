using System.Text.Json;
using MeningOilam.Application.Abstractions;

namespace MeningOilam.Infrastructure.Telegram;

public class TelegramService(TelegramClient client) : ITelegramService
{
    public bool Enabled => client.Enabled;

    public static object? BuildKeyboard(IReadOnlyList<IReadOnlyList<TgButton>>? keyboard)
    {
        if (keyboard is null || keyboard.Count == 0) return null;
        var rows = keyboard.Select(row => row.Select(b =>
        {
            if (b.Url is not null) return (object)new { text = b.Text, url = b.Url };
            if (b.WebAppUrl is not null) return new { text = b.Text, web_app = new { url = b.WebAppUrl } };
            return new { text = b.Text, callback_data = b.CallbackData ?? "" };
        }).ToArray()).ToArray();
        return new { inline_keyboard = rows };
    }

    public async Task<int?> SendMessageAsync(long chatId, string text, IReadOnlyList<IReadOnlyList<TgButton>>? keyboard = null,
        string? parseMode = "HTML", int? threadId = null, bool disableNotification = false, CancellationToken ct = default)
    {
        var body = new Dictionary<string, object?>
        {
            ["chat_id"] = chatId,
            ["text"] = text,
            ["disable_notification"] = disableNotification,
        };
        if (parseMode is not null) body["parse_mode"] = parseMode;
        if (threadId is not null) body["message_thread_id"] = threadId;
        var km = BuildKeyboard(keyboard);
        if (km is not null) body["reply_markup"] = km;
        var res = await client.CallAsync("sendMessage", body, ct);
        if (res is not null && res.Value.TryGetProperty("message_id", out var id)) return id.GetInt32();
        return null;
    }

    public async Task<int?> SendVideoAsync(long chatId, byte[] video, string fileName, string? caption = null,
        string? parseMode = "HTML", int? replyToMessageId = null, int? threadId = null, CancellationToken ct = default)
    {
        using var content = new MultipartFormDataContent
        {
            { new StringContent(chatId.ToString()), "chat_id" },
            { new StringContent("true"), "supports_streaming" },
        };
        if (caption is not null)
        {
            content.Add(new StringContent(caption), "caption");
            if (parseMode is not null) content.Add(new StringContent(parseMode), "parse_mode");
        }
        if (threadId is not null) content.Add(new StringContent(threadId.Value.ToString()), "message_thread_id");
        if (replyToMessageId is not null)
            content.Add(new StringContent(
                JsonSerializer.Serialize(new { message_id = replyToMessageId.Value, allow_sending_without_reply = true })),
                "reply_parameters");

        var file = new ByteArrayContent(video);
        file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("video/mp4");
        content.Add(file, "video", fileName);

        var res = await client.CallMultipartAsync("sendVideo", content, ct);
        if (res is not null && res.Value.TryGetProperty("message_id", out var id)) return id.GetInt32();
        return null;
    }

    public Task DeleteMessageAsync(long chatId, int messageId, CancellationToken ct = default) =>
        client.CallAsync("deleteMessage", new { chat_id = chatId, message_id = messageId }, ct);

    public Task BanAsync(long chatId, long userId, CancellationToken ct = default) =>
        client.CallAsync("banChatMember", new { chat_id = chatId, user_id = userId }, ct);

    public Task UnbanAsync(long chatId, long userId, CancellationToken ct = default) =>
        client.CallAsync("unbanChatMember", new { chat_id = chatId, user_id = userId, only_if_banned = true }, ct);

    public async Task<bool> RestrictAsync(long chatId, long userId, DateTimeOffset? until = null, CancellationToken ct = default)
    {
        var res = await client.CallAsync("restrictChatMember", new
        {
            chat_id = chatId,
            user_id = userId,
            permissions = new { can_send_messages = false, can_send_media_messages = false, can_send_polls = false, can_send_other_messages = false, can_add_web_page_previews = false },
            until_date = until?.ToUnixTimeSeconds(),
        }, ct);
        return res is not null;
    }

    public Task UnrestrictAsync(long chatId, long userId, CancellationToken ct = default) =>
        client.CallAsync("restrictChatMember", new
        {
            chat_id = chatId,
            user_id = userId,
            permissions = new
            {
                can_send_messages = true, can_send_audios = true, can_send_documents = true,
                can_send_photos = true, can_send_videos = true, can_send_video_notes = true,
                can_send_voice_notes = true, can_send_polls = true, can_send_other_messages = true,
                can_add_web_page_previews = true, can_invite_users = true,
            },
        }, ct);

    public async Task<string?> CreateInviteLinkAsync(long chatId, int? memberLimit = null, CancellationToken ct = default)
    {
        var res = await client.CallAsync("createChatInviteLink",
            new { chat_id = chatId, member_limit = memberLimit }, ct);
        return res?.TryGetProperty("invite_link", out var link) == true ? link.GetString() : null;
    }

    public async Task<bool> IsChatAdminAsync(long chatId, long userId, CancellationToken ct = default)
    {
        var res = await client.CallAsync("getChatMember", new { chat_id = chatId, user_id = userId }, ct);
        if (res is null || !res.Value.TryGetProperty("status", out var s)) return false;
        var status = s.GetString();
        return status is "administrator" or "creator";
    }

    public Task SetWebhookAsync(string url, string? secret, CancellationToken ct = default) =>
        client.CallAsync("setWebhook", new
        {
            url,
            secret_token = secret,
            allowed_updates = new[] { "message", "edited_message", "callback_query", "my_chat_member", "chat_member" },
            drop_pending_updates = false,
        }, ct);

    public Task DeleteWebhookAsync(CancellationToken ct = default) =>
        client.CallAsync("deleteWebhook", new { drop_pending_updates = false }, ct);

    public async Task<object?> GetWebhookInfoAsync(CancellationToken ct = default)
    {
        var r = await client.CallAsync("getWebhookInfo", null, ct);
        return r is null ? null : JsonSerializer.Deserialize<object>(r.Value.GetRawText());
    }

    public async Task<object?> GetMeAsync(CancellationToken ct = default)
    {
        var r = await client.CallAsync("getMe", null, ct);
        return r is null ? null : JsonSerializer.Deserialize<object>(r.Value.GetRawText());
    }
}
