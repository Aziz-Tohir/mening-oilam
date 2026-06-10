namespace MeningOilam.Infrastructure.Configuration;

public class JwtOptions
{
    public const string Section = "Jwt";
    public string Issuer { get; set; } = "mening-oilam";
    public string Audience { get; set; } = "mening-oilam";
    public string Secret { get; set; } = "CHANGE_ME_DEV_SECRET_AT_LEAST_32_CHARS_LONG!!";
    public int AccessTokenMinutes { get; set; } = 60;
    public int RefreshTokenDays { get; set; } = 30;
}

public class TelegramOptions
{
    public const string Section = "Telegram";
    /// <summary>Real bot token from @BotFather. Required for the bot to operate.</summary>
    public string? BotToken { get; set; }
    public string? BotUsername { get; set; }
    /// <summary>Secret token validated on the webhook (X-Telegram-Bot-Api-Secret-Token).</summary>
    public string? WebhookSecret { get; set; }
    /// <summary>"polling" or "webhook".</summary>
    public string Mode { get; set; } = "polling";
    /// <summary>Public base URL of the mini app / dashboard (for web_app buttons & deep links).</summary>
    public string MiniAppUrl { get; set; } = "https://mening-oilam.lovable.app";
    public bool Enabled => !string.IsNullOrWhiteSpace(BotToken);
}

public class AiOptions
{
    public const string Section = "Ai";
    /// <summary>OpenAI-compatible base URL, e.g. https://api.openai.com/v1 or a Gemini/OpenRouter gateway.</summary>
    public string? BaseUrl { get; set; }
    public string? ApiKey { get; set; }
    public string Model { get; set; } = "gpt-4o-mini";
    public bool Enabled => !string.IsNullOrWhiteSpace(BaseUrl) && !string.IsNullOrWhiteSpace(ApiKey);
}

public class StorageOptions
{
    public const string Section = "Storage";
    /// <summary>"local" or "s3".</summary>
    public string Provider { get; set; } = "local";
    /// <summary>Local disk root for uploaded files.</summary>
    public string LocalPath { get; set; } = "wwwroot/uploads";
    /// <summary>Public base URL files are served from.</summary>
    public string PublicBaseUrl { get; set; } = "/uploads";
    // S3 (optional)
    public string? S3Endpoint { get; set; }
    public string? S3Bucket { get; set; }
    public string? S3AccessKey { get; set; }
    public string? S3SecretKey { get; set; }
}

public class CobaltOptions
{
    public const string Section = "Cobalt";
    /// <summary>Base URL of a self-hosted cobalt instance, e.g. https://cobalt.example.com. Empty = feature off.</summary>
    public string? BaseUrl { get; set; }
    /// <summary>Optional "Api-Key" value if the cobalt instance is protected.</summary>
    public string? ApiKey { get; set; }
    /// <summary>Preferred max video quality cobalt should target ("360".."max").</summary>
    public string VideoQuality { get; set; } = "720";
    /// <summary>Hard re-upload cap. Telegram Bot API allows up to 50 MB per uploaded file.</summary>
    public int MaxFileSizeMb { get; set; } = 48;
    public bool Enabled => !string.IsNullOrWhiteSpace(BaseUrl);
}

public class CronOptions
{
    public const string Section = "Cron";
    public bool Enabled { get; set; } = true;
    public string DailyReminders { get; set; } = "*/15 * * * *";
    public string ProcessJoinRequests { get; set; } = "*/30 * * * *";
    public string SentimentAnalysis { get; set; } = "30 2 * * *";
    public string AnnualAwards { get; set; } = "0 6 1 1 *";
    /// <summary>Shared secret for any externally-triggered cron/maintenance endpoints.</summary>
    public string Secret { get; set; } = "CHANGE_ME_CRON_SECRET";
}
