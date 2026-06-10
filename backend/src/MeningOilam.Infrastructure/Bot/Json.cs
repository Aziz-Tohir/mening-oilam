using System.Text.Json;

namespace MeningOilam.Infrastructure.Bot;

/// <summary>Safe accessors over Telegram update JsonElement payloads.</summary>
public static class JsonExt
{
    public static JsonElement? Prop(this JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) ? v : null;

    public static JsonElement? Path(this JsonElement e, params string[] names)
    {
        JsonElement? cur = e;
        foreach (var n in names)
        {
            cur = cur?.Prop(n);
            if (cur is null) return null;
        }
        return cur;
    }

    public static string? Str(this JsonElement? e) =>
        e is { ValueKind: JsonValueKind.String } v ? v.GetString() : null;

    public static long? Long(this JsonElement? e) =>
        e is { ValueKind: JsonValueKind.Number } v && v.TryGetInt64(out var l) ? l : null;

    public static int? Int(this JsonElement? e) =>
        e is { ValueKind: JsonValueKind.Number } v && v.TryGetInt32(out var i) ? i : null;

    public static bool Bool(this JsonElement? e) =>
        e is { ValueKind: JsonValueKind.True };
}
