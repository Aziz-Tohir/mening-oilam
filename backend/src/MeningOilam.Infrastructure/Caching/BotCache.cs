using MeningOilam.Domain.Entities;
using MeningOilam.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace MeningOilam.Infrastructure.Caching;

/// <summary>Replaces cache.server.ts — short-TTL lookups on the bot hot path.</summary>
public class BotCache(HybridCache cache, AppDbContext db)
{
    private static readonly HybridCacheEntryOptions Short = new() { Expiration = TimeSpan.FromSeconds(30) };
    private static readonly HybridCacheEntryOptions Medium = new() { Expiration = TimeSpan.FromSeconds(60) };

    public ValueTask<FamilyLite?> GetFamilyByChatIdAsync(long chatId, CancellationToken ct = default) =>
        cache.GetOrCreateAsync($"fam:chat:{chatId}", chatId, async (id, c) =>
            await db.Families.AsNoTracking().Where(f => f.TelegramGroupId == id)
                .Select(f => new FamilyLite(f.Id, f.TelegramGroupId, f.Name)).FirstOrDefaultAsync(c),
            Medium, cancellationToken: ct);

    public ValueTask<FamilySettings?> GetFamilySettingsAsync(Guid familyId, CancellationToken ct = default) =>
        cache.GetOrCreateAsync($"fam:settings:{familyId}", familyId, async (id, c) =>
            await db.FamilySettings.AsNoTracking().FirstOrDefaultAsync(s => s.FamilyId == id, c),
            Short, cancellationToken: ct);

    public ValueTask<List<BannedWordLite>> GetBannedWordsAsync(Guid familyId, CancellationToken ct = default) =>
        cache.GetOrCreateAsync($"fam:banned:{familyId}", familyId, async (id, c) =>
            await db.BannedWords.AsNoTracking().Where(w => w.FamilyId == id)
                .Select(w => new BannedWordLite(w.Pattern, w.IsRegex, w.Action)).ToListAsync(c),
            Medium, cancellationToken: ct);

    public ValueTask<MemberLite?> GetMemberAsync(Guid familyId, long telegramId, CancellationToken ct = default) =>
        cache.GetOrCreateAsync($"fam:member:{familyId}:{telegramId}", (familyId, telegramId), async (k, c) =>
            await db.FamilyMembers.AsNoTracking()
                .Where(m => m.FamilyId == k.familyId && m.TelegramId == k.telegramId)
                .Select(m => new MemberLite(m.Id, m.FullName, m.SentimentOptOut, m.Status)).FirstOrDefaultAsync(c),
            Short, cancellationToken: ct);

    public async ValueTask InvalidateFamilyAsync(Guid familyId)
    {
        await cache.RemoveAsync($"fam:settings:{familyId}");
        await cache.RemoveAsync($"fam:banned:{familyId}");
    }
}

public record FamilyLite(Guid Id, long? TelegramGroupId, string Name);
public record BannedWordLite(string Pattern, bool IsRegex, string Action);
public record MemberLite(Guid Id, string FullName, bool SentimentOptOut, Domain.Enums.MemberStatus Status);
