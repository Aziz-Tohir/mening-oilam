namespace MeningOilam.Application.Kinship;

public record EdgeRow(Guid Member1, Guid Member2, string Type);

public record KinshipResult(bool Found, string? Type, string Label, IReadOnlyList<string> Chain, IReadOnlyList<Guid> Path);

/// <summary>Walks the relationships graph and labels the connection (ported from lib/kinship.ts).
/// Edge convention: relationships(member_1=A, member_2=B, type=T) means "B is T to A".</summary>
public static class KinshipCalculator
{
    private static readonly Dictionary<string, string> Inverse = new()
    {
        ["father"] = "son", ["mother"] = "son", ["son"] = "father", ["daughter"] = "father",
        ["brother"] = "brother", ["sister"] = "sister", ["husband"] = "wife", ["wife"] = "husband",
        ["uncle_paternal"] = "nephew", ["uncle_maternal"] = "nephew",
        ["aunt_paternal"] = "niece", ["aunt_maternal"] = "niece",
        ["nephew"] = "uncle_paternal", ["niece"] = "aunt_paternal",
        ["cousin_male"] = "cousin_male", ["cousin_female"] = "cousin_female",
        ["grandfather"] = "grandson", ["grandmother"] = "granddaughter",
        ["grandson"] = "grandfather", ["granddaughter"] = "grandmother",
        ["father_in_law"] = "son_in_law", ["mother_in_law"] = "daughter_in_law",
        ["son_in_law"] = "father_in_law", ["daughter_in_law"] = "mother_in_law",
        ["brother_in_law"] = "brother_in_law", ["sister_in_law"] = "sister_in_law",
        ["other"] = "other",
    };

    private static readonly Dictionary<string, Dictionary<string, string>> Compose = new()
    {
        ["father"] = new() { ["father"] = "grandfather", ["mother"] = "grandmother", ["brother"] = "uncle_paternal", ["sister"] = "aunt_paternal", ["son"] = "brother", ["daughter"] = "sister", ["wife"] = "mother" },
        ["mother"] = new() { ["father"] = "grandfather", ["mother"] = "grandmother", ["brother"] = "uncle_maternal", ["sister"] = "aunt_maternal", ["son"] = "brother", ["daughter"] = "sister", ["husband"] = "father" },
        ["son"] = new() { ["son"] = "grandson", ["daughter"] = "granddaughter", ["wife"] = "daughter_in_law" },
        ["daughter"] = new() { ["son"] = "grandson", ["daughter"] = "granddaughter", ["husband"] = "son_in_law" },
        ["brother"] = new() { ["son"] = "nephew", ["daughter"] = "niece", ["wife"] = "sister_in_law" },
        ["sister"] = new() { ["son"] = "nephew", ["daughter"] = "niece", ["husband"] = "brother_in_law" },
        ["husband"] = new() { ["father"] = "father_in_law", ["mother"] = "mother_in_law", ["brother"] = "brother_in_law", ["sister"] = "sister_in_law", ["son"] = "son", ["daughter"] = "daughter" },
        ["wife"] = new() { ["father"] = "father_in_law", ["mother"] = "mother_in_law", ["brother"] = "brother_in_law", ["sister"] = "sister_in_law", ["son"] = "son", ["daughter"] = "daughter" },
        ["uncle_paternal"] = new() { ["son"] = "cousin_male", ["daughter"] = "cousin_female" },
        ["uncle_maternal"] = new() { ["son"] = "cousin_male", ["daughter"] = "cousin_female" },
        ["aunt_paternal"] = new() { ["son"] = "cousin_male", ["daughter"] = "cousin_female" },
        ["aunt_maternal"] = new() { ["son"] = "cousin_male", ["daughter"] = "cousin_female" },
        ["grandfather"] = new() { ["brother"] = "grandfather", ["sister"] = "grandmother" },
        ["grandmother"] = new() { ["brother"] = "grandfather", ["sister"] = "grandmother" },
    };

    private static Dictionary<Guid, List<(Guid To, string Type)>> BuildGraph(IEnumerable<EdgeRow> edges)
    {
        var g = new Dictionary<Guid, List<(Guid, string)>>();
        void Push(Guid from, Guid to, string type)
        {
            if (!g.TryGetValue(from, out var list)) g[from] = list = new();
            list.Add((to, type));
        }
        foreach (var e in edges)
        {
            Push(e.Member1, e.Member2, e.Type);
            Push(e.Member2, e.Member1, Inverse.GetValueOrDefault(e.Type, "other"));
        }
        return g;
    }

    private static (List<Guid> path, List<string> chain)? ShortestPath(
        Dictionary<Guid, List<(Guid To, string Type)>> g, Guid from, Guid to)
    {
        if (from == to) return (new List<Guid> { from }, new List<string>());
        var prev = new Dictionary<Guid, (Guid node, string type)>();
        var visited = new HashSet<Guid> { from };
        var queue = new Queue<Guid>();
        queue.Enqueue(from);
        while (queue.Count > 0)
        {
            var cur = queue.Dequeue();
            if (!g.TryGetValue(cur, out var edges)) continue;
            foreach (var (toNode, type) in edges)
            {
                if (!visited.Add(toNode)) continue;
                prev[toNode] = (cur, type);
                if (toNode == to)
                {
                    var path = new List<Guid>();
                    var chain = new List<string>();
                    var n = to;
                    while (n != from)
                    {
                        var p = prev[n];
                        path.Insert(0, n);
                        chain.Insert(0, p.type);
                        n = p.node;
                    }
                    path.Insert(0, from);
                    return (path, chain);
                }
                queue.Enqueue(toNode);
            }
        }
        return null;
    }

    private static string? ReduceChain(IReadOnlyList<string> chain)
    {
        if (chain.Count == 0) return null;
        if (chain.Count == 1) return chain[0];
        var acc = chain[0];
        for (var i = 1; i < chain.Count; i++)
        {
            if (Compose.TryGetValue(acc, out var m) && m.TryGetValue(chain[i], out var next)) acc = next;
            else return null;
        }
        return acc;
    }

    public static KinshipResult Calculate(IEnumerable<EdgeRow> edges, Guid fromId, Guid toId)
    {
        if (fromId == toId)
            return new KinshipResult(true, null, "Bu o'sha shaxs", Array.Empty<string>(), new[] { fromId });

        var g = BuildGraph(edges);
        var sp = ShortestPath(g, fromId, toId);
        if (sp is null) return new KinshipResult(false, null, "Aloqa topilmadi", Array.Empty<string>(), Array.Empty<Guid>());

        var reduced = ReduceChain(sp.Value.chain);
        if (reduced is not null)
            return new KinshipResult(true, reduced, Relationships.Label(reduced), sp.Value.chain, sp.Value.path);

        var described = string.Join(" → ", sp.Value.chain.Select(Relationships.Label));
        return new KinshipResult(true, null, described, sp.Value.chain, sp.Value.path);
    }
}
