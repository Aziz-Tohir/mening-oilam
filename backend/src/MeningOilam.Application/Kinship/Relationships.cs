namespace MeningOilam.Application.Kinship;

/// <summary>Uzbek labels for relationship types (snake_case keys match the DB enum labels).</summary>
public static class Relationships
{
    public static readonly IReadOnlyList<(string Value, string Label)> Options = new (string, string)[]
    {
        ("self", "Men (o'zim)"), ("father", "Otam"), ("mother", "Onam"), ("son", "O'g'lim"),
        ("daughter", "Qizim"), ("brother", "Akam/Ukam"), ("sister", "Opam/Singlim"),
        ("husband", "Erim"), ("wife", "Xotinim"), ("uncle_paternal", "Amakim"),
        ("uncle_maternal", "Tog'am"), ("aunt_paternal", "Ammam"), ("aunt_maternal", "Xolam"),
        ("cousin_male", "Amakivachcham (erkak)"), ("cousin_female", "Amakivachcham (ayol)"),
        ("grandfather", "Bobom"), ("grandmother", "Buvim"), ("grandson", "Nevaram (o'g'il)"),
        ("granddaughter", "Nevaram (qiz)"), ("father_in_law", "Qaynotam"), ("mother_in_law", "Qaynonam"),
        ("son_in_law", "Kuyovim"), ("daughter_in_law", "Kelinim"), ("brother_in_law", "Qaynaka/Qaynuka"),
        ("sister_in_law", "Qaynsingil"), ("nephew", "Jiyanim (o'g'il)"), ("niece", "Jiyanim (qiz)"),
        ("step_father", "O'gay otam"), ("step_mother", "O'gay onam"), ("step_son", "O'gay o'g'lim"),
        ("step_daughter", "O'gay qizim"), ("half_brother", "O'gay akam/ukam"), ("half_sister", "O'gay opam/singlim"),
        ("great_grandfather", "Buvamning otasi"), ("great_grandmother", "Buvamning onasi"),
        ("great_grandson", "Chevaram (o'g'il)"), ("great_granddaughter", "Chevaram (qiz)"),
        ("godfather", "Otaxon"), ("godmother", "Onaxon"), ("family_friend", "Oila do'sti"),
        ("other", "Boshqa qarindosh"),
    };

    private static readonly Dictionary<string, string> _labels = Options.ToDictionary(o => o.Value, o => o.Label);

    public static string Label(string? value) =>
        value is null ? "—" : _labels.GetValueOrDefault(value, value);
}
