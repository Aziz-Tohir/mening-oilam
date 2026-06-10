using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Web;

namespace MeningOilam.Infrastructure.Auth;

public record TelegramUserInfo(long Id, string? Username, string? FirstName, string? LastName, string? LanguageCode);

public static class TelegramInitData
{
    /// <summary>Validates Telegram WebApp initData per the documented HMAC-SHA256 scheme.
    /// Returns the parsed user when valid and not older than maxAge.</summary>
    public static TelegramUserInfo? Validate(string initData, string botToken, TimeSpan maxAge)
    {
        if (string.IsNullOrWhiteSpace(initData) || string.IsNullOrWhiteSpace(botToken)) return null;

        var pairs = HttpUtility.ParseQueryString(initData);
        var hash = pairs["hash"];
        if (string.IsNullOrEmpty(hash)) return null;

        var dataCheck = pairs.AllKeys
            .Where(k => k is not null && k != "hash")
            .OrderBy(k => k, StringComparer.Ordinal)
            .Select(k => $"{k}={pairs[k]}")
            .ToArray();
        var dataCheckString = string.Join("\n", dataCheck);

        // secret_key = HMAC_SHA256("WebAppData", bot_token)
        var secretKey = HMACSHA256.HashData(Encoding.UTF8.GetBytes("WebAppData"), Encoding.UTF8.GetBytes(botToken));
        var computed = HMACSHA256.HashData(secretKey, Encoding.UTF8.GetBytes(dataCheckString));
        var computedHex = Convert.ToHexString(computed).ToLowerInvariant();
        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(computedHex), Encoding.UTF8.GetBytes(hash.ToLowerInvariant())))
            return null;

        if (long.TryParse(pairs["auth_date"], out var authDate))
        {
            var ts = DateTimeOffset.FromUnixTimeSeconds(authDate);
            if (DateTimeOffset.UtcNow - ts > maxAge) return null;
        }

        var userJson = pairs["user"];
        if (string.IsNullOrEmpty(userJson)) return null;
        using var doc = JsonDocument.Parse(userJson);
        var root = doc.RootElement;
        return new TelegramUserInfo(
            root.GetProperty("id").GetInt64(),
            root.TryGetProperty("username", out var u) ? u.GetString() : null,
            root.TryGetProperty("first_name", out var f) ? f.GetString() : null,
            root.TryGetProperty("last_name", out var l) ? l.GetString() : null,
            root.TryGetProperty("language_code", out var lc) ? lc.GetString() : null);
    }
}
