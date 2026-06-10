using System.Text.RegularExpressions;

namespace MeningOilam.Infrastructure.Media;

/// <summary>Finds the first supported media link inside a message body.</summary>
public static partial class VideoLinkDetector
{
    [GeneratedRegex(@"https?://[^\s<>""]+", RegexOptions.IgnoreCase)]
    private static partial Regex UrlRegex();

    // Hosts cobalt supports and that users typically share videos from.
    private static readonly string[] Hosts =
    {
        "youtube.com", "youtu.be", "instagram.com", "tiktok.com", "vm.tiktok.com",
        "twitter.com", "x.com", "facebook.com", "fb.watch", "fb.com",
        "reddit.com", "redd.it", "vk.com", "pinterest.com", "pin.it",
        "tumblr.com", "soundcloud.com", "twitch.tv", "dailymotion.com",
        "ok.ru", "bilibili.com", "rutube.ru", "snapchat.com", "loom.com",
    };

    public static string? FirstSupportedUrl(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        foreach (Match m in UrlRegex().Matches(text))
        {
            if (!Uri.TryCreate(m.Value, UriKind.Absolute, out var uri)) continue;
            var host = uri.Host.StartsWith("www.", StringComparison.OrdinalIgnoreCase) ? uri.Host[4..] : uri.Host;
            if (Hosts.Any(h => host.Equals(h, StringComparison.OrdinalIgnoreCase)
                               || host.EndsWith("." + h, StringComparison.OrdinalIgnoreCase)))
                return m.Value.TrimEnd('.', ',', ')', ']');
        }
        return null;
    }
}
