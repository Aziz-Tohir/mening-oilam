using System.Text;

namespace MeningOilam.Application.Common;

public static class Naming
{
    /// <summary>PascalCase -> snake_case, matching Npgsql enum label translation.
    /// e.g. AwaitingRelativeChoice -> awaiting_relative_choice.</summary>
    public static string ToSnake(string name)
    {
        var sb = new StringBuilder(name.Length + 8);
        for (var i = 0; i < name.Length; i++)
        {
            var c = name[i];
            if (char.IsUpper(c))
            {
                if (i > 0) sb.Append('_');
                sb.Append(char.ToLowerInvariant(c));
            }
            else sb.Append(c);
        }
        return sb.ToString();
    }

    public static string ToSnake(Enum value) => ToSnake(value.ToString());
}
