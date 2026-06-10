using System.Net.Http.Json;
using System.Text.Json;
using MeningOilam.Application.Abstractions;
using MeningOilam.Infrastructure.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace MeningOilam.Infrastructure.Ai;

public class NullSentimentAnalyzer : ISentimentAnalyzer
{
    public bool Enabled => false;
    public Task<IReadOnlyDictionary<long, double>> ScoreAsync(IReadOnlyList<SentimentInput> inputs, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyDictionary<long, double>>(new Dictionary<long, double>());
}

/// <summary>OpenAI-compatible chat completions with a tool-call returning per-user scores [0..1],
/// normalized to [-1..1]. Works with OpenAI, OpenRouter, Gemini OpenAI-compat gateways, local LLMs.</summary>
public class OpenAiSentimentAnalyzer(HttpClient http, IOptions<AiOptions> options, ILogger<OpenAiSentimentAnalyzer> log)
    : ISentimentAnalyzer
{
    private readonly AiOptions _o = options.Value;
    public bool Enabled => _o.Enabled;

    public async Task<IReadOnlyDictionary<long, double>> ScoreAsync(IReadOnlyList<SentimentInput> inputs, CancellationToken ct = default)
    {
        var result = new Dictionary<long, double>();
        if (!Enabled || inputs.Count == 0) return result;

        foreach (var batch in inputs.Chunk(10))
        {
            var lines = batch.Select(i => $"telegram_id={i.TelegramId}: " +
                string.Join(" | ", i.Messages.Take(40).Select(m => m.Replace('\n', ' ')))).ToArray();
            var prompt = "Quyidagi oilaviy chat xabarlari kayfiyatini har bir foydalanuvchi uchun 0 (juda salbiy) dan 1 (juda ijobiy) gacha baholang. " +
                         "Faqat report_scores asbobini chaqiring.\n\n" + string.Join("\n", lines);
            try
            {
                var req = new
                {
                    model = _o.Model,
                    messages = new[] { new { role = "user", content = prompt } },
                    tools = new[]
                    {
                        new
                        {
                            type = "function",
                            function = new
                            {
                                name = "report_scores",
                                description = "Report sentiment scores per telegram_id",
                                parameters = new
                                {
                                    type = "object",
                                    properties = new
                                    {
                                        items = new
                                        {
                                            type = "array",
                                            items = new
                                            {
                                                type = "object",
                                                properties = new
                                                {
                                                    telegram_id = new { type = "number" },
                                                    score = new { type = "number" },
                                                },
                                                required = new[] { "telegram_id", "score" },
                                            },
                                        },
                                    },
                                    required = new[] { "items" },
                                },
                            },
                        },
                    },
                    tool_choice = new { type = "function", function = new { name = "report_scores" } },
                };

                using var msg = new HttpRequestMessage(HttpMethod.Post, $"{_o.BaseUrl!.TrimEnd('/')}/chat/completions");
                msg.Headers.Add("Authorization", $"Bearer {_o.ApiKey}");
                msg.Content = JsonContent.Create(req);
                using var res = await http.SendAsync(msg, ct);
                var doc = await res.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
                var args = doc.GetProperty("choices")[0].GetProperty("message")
                    .GetProperty("tool_calls")[0].GetProperty("function").GetProperty("arguments").GetString();
                if (args is null) continue;
                using var parsed = JsonDocument.Parse(args);
                foreach (var item in parsed.RootElement.GetProperty("items").EnumerateArray())
                {
                    var tid = item.GetProperty("telegram_id").GetInt64();
                    var raw = item.GetProperty("score").GetDouble();
                    result[tid] = Math.Clamp(raw * 2 - 1, -1, 1); // [0..1] -> [-1..1]
                }
            }
            catch (Exception ex)
            {
                log.LogWarning(ex, "Sentiment scoring batch failed");
            }
        }
        return result;
    }
}
