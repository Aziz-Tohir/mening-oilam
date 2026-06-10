using System.Text.Json;
using MeningOilam.Domain.Entities;
using MeningOilam.Infrastructure.Configuration;
using MeningOilam.Infrastructure.Data;
using MeningOilam.Infrastructure.Telegram;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace MeningOilam.Infrastructure.Bot;

/// <summary>Long-polls Telegram getUpdates and dispatches to the processor. Replaces the poll route + pg_cron.</summary>
public class PollingService(
    IServiceScopeFactory scopeFactory,
    IOptions<TelegramOptions> options,
    ILogger<PollingService> log) : BackgroundService
{
    private readonly TelegramOptions _o = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_o.Enabled || _o.Mode != "polling")
        {
            log.LogInformation("Telegram polling disabled (mode={Mode}, hasToken={HasToken})", _o.Mode, _o.Enabled);
            return;
        }

        log.LogInformation("Telegram polling started");
        long offset = await LoadOffsetAsync(stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var pollScope = scopeFactory.CreateScope();
                var client = pollScope.ServiceProvider.GetRequiredService<TelegramClient>();
                var updates = await client.CallAsync("getUpdates", new
                {
                    offset, timeout = 25,
                    allowed_updates = new[] { "message", "edited_message", "callback_query", "my_chat_member", "chat_member" },
                }, stoppingToken);

                if (updates is { ValueKind: JsonValueKind.Array })
                {
                    foreach (var update in updates.Value.EnumerateArray())
                    {
                        var updateId = update.Prop("update_id").Long() ?? 0;
                        offset = Math.Max(offset, updateId + 1);
                        await DispatchAsync(update, updateId, stoppingToken);
                    }
                    await SaveOffsetAsync(offset, stoppingToken);
                }
                else
                {
                    await Task.Delay(2000, stoppingToken);
                }
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                log.LogWarning(ex, "Polling loop error; backing off");
                await Task.Delay(5000, stoppingToken);
            }
        }
    }

    private async Task DispatchAsync(JsonElement update, long updateId, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var processor = scope.ServiceProvider.GetRequiredService<BotUpdateProcessor>();

        // Idempotent raw store
        if (!await db.TelegramUpdatesRaw.AnyAsync(u => u.UpdateId == updateId, ct))
            db.TelegramUpdatesRaw.Add(new TelegramUpdateRaw { UpdateId = updateId, Payload = JsonDocument.Parse(update.GetRawText()) });
        await db.SaveChangesAsync(ct);

        try
        {
            await processor.ProcessAsync(update, ct);
            var raw = await db.TelegramUpdatesRaw.FirstOrDefaultAsync(u => u.UpdateId == updateId, ct);
            if (raw is not null) { raw.ProcessedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(ct); }
        }
        catch (Exception ex)
        {
            var raw = await db.TelegramUpdatesRaw.FirstOrDefaultAsync(u => u.UpdateId == updateId, ct);
            if (raw is not null) { raw.Error = ex.Message; await db.SaveChangesAsync(ct); }
        }
    }

    private async Task<long> LoadOffsetAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var state = await db.TelegramBotStates.FirstOrDefaultAsync(s => s.Id == 1, ct);
        return state?.UpdateOffset ?? 0;
    }

    private async Task SaveOffsetAsync(long offset, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var state = await db.TelegramBotStates.FirstOrDefaultAsync(s => s.Id == 1, ct);
        if (state is null) db.TelegramBotStates.Add(new TelegramBotState { Id = 1, UpdateOffset = offset, LastPolledAt = DateTimeOffset.UtcNow });
        else { state.UpdateOffset = offset; state.LastPolledAt = DateTimeOffset.UtcNow; }
        await db.SaveChangesAsync(ct);
    }
}
