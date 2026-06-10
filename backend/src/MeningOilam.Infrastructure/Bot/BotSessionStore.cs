using System.Text.Json;
using MeningOilam.Domain.Entities;
using MeningOilam.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace MeningOilam.Infrastructure.Bot;

/// <summary>Persists the bot conversation state machine (bot_sessions table).</summary>
public class BotSessionStore(AppDbContext db)
{
    public async Task<(string step, JsonElement data)?> GetAsync(long telegramId, CancellationToken ct = default)
    {
        var s = await db.BotSessions.AsNoTracking().FirstOrDefaultAsync(x => x.TelegramId == telegramId, ct);
        return s is null ? null : (s.Step, s.Data.RootElement.Clone());
    }

    public async Task SetAsync(long telegramId, string step, object? data = null, CancellationToken ct = default)
    {
        var json = JsonSerializer.SerializeToDocument(data ?? new { });
        var s = await db.BotSessions.FirstOrDefaultAsync(x => x.TelegramId == telegramId, ct);
        if (s is null)
        {
            db.BotSessions.Add(new BotSession { TelegramId = telegramId, Step = step, Data = json, UpdatedAt = DateTimeOffset.UtcNow });
        }
        else
        {
            s.Step = step; s.Data = json; s.UpdatedAt = DateTimeOffset.UtcNow;
        }
        await db.SaveChangesAsync(ct);
    }

    public async Task ClearAsync(long telegramId, CancellationToken ct = default)
    {
        await db.BotSessions.Where(x => x.TelegramId == telegramId).ExecuteDeleteAsync(ct);
    }
}
