namespace MeningOilam.Infrastructure.Localization;

/// <summary>Mechanical Latin -> Cyrillic transliteration for Uzbek (ported from the TS util).</summary>
public static class Transliteration
{
    private static readonly (string lat, string cyr)[] Map =
    {
        ("sh", "ш"), ("ch", "ч"), ("yo", "ё"), ("yu", "ю"), ("ya", "я"), ("ye", "е"),
        ("o'", "ў"), ("g'", "ғ"), ("o`", "ў"), ("g`", "ғ"),
        ("Sh", "Ш"), ("Ch", "Ч"), ("Yo", "Ё"), ("Yu", "Ю"), ("Ya", "Я"), ("Ye", "Е"),
        ("O'", "Ў"), ("G'", "Ғ"),
        ("a", "а"), ("b", "б"), ("d", "д"), ("e", "е"), ("f", "ф"), ("g", "г"),
        ("h", "ҳ"), ("i", "и"), ("j", "ж"), ("k", "к"), ("l", "л"), ("m", "м"),
        ("n", "н"), ("o", "о"), ("p", "п"), ("q", "қ"), ("r", "р"), ("s", "с"),
        ("t", "т"), ("u", "у"), ("v", "в"), ("x", "х"), ("y", "й"), ("z", "з"),
        ("A", "А"), ("B", "Б"), ("D", "Д"), ("E", "Е"), ("F", "Ф"), ("G", "Г"),
        ("H", "Ҳ"), ("I", "И"), ("J", "Ж"), ("K", "К"), ("L", "Л"), ("M", "М"),
        ("N", "Н"), ("O", "О"), ("P", "П"), ("Q", "Қ"), ("R", "Р"), ("S", "С"),
        ("T", "Т"), ("U", "У"), ("V", "В"), ("X", "Х"), ("Y", "Й"), ("Z", "З"),
    };

    public static string LatinToCyrillic(string text)
    {
        var result = text;
        foreach (var (lat, cyr) in Map)
            result = result.Replace(lat, cyr);
        return result;
    }
}
