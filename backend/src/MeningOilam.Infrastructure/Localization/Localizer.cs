using System.Reflection;
using System.Text.Json;
using MeningOilam.Application.Abstractions;

namespace MeningOilam.Infrastructure.Localization;

public class Localizer : ILocalizer
{
    private readonly Dictionary<string, Dictionary<string, string>> _dicts = new();
    private const string Default = "uz";

    public Localizer()
    {
        foreach (var lang in new[] { "uz", "ru", "en" })
            _dicts[lang] = Load(lang);
    }

    private static Dictionary<string, string> Load(string lang)
    {
        var asm = Assembly.GetExecutingAssembly();
        var resName = asm.GetManifestResourceNames()
            .FirstOrDefault(n => n.EndsWith($"locales.{lang}.json", StringComparison.OrdinalIgnoreCase));
        if (resName is null) return new();
        using var stream = asm.GetManifestResourceStream(resName)!;
        using var reader = new StreamReader(stream);
        var json = reader.ReadToEnd();
        return JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? new();
    }

    public string T(string key, string? lang = null, IReadOnlyDictionary<string, string>? vars = null)
    {
        lang ??= Default;
        var baseLang = lang == "uz_cyrl" ? "uz" : lang;
        if (!_dicts.TryGetValue(baseLang, out var dict)) dict = _dicts[Default];
        var value = dict.TryGetValue(key, out var v) ? v
            : (_dicts[Default].TryGetValue(key, out var d) ? d : key);

        if (vars is not null)
            foreach (var (k, val) in vars)
                value = value.Replace("{" + k + "}", val);

        if (lang == "uz_cyrl") value = Transliteration.LatinToCyrillic(value);
        return value;
    }
}
