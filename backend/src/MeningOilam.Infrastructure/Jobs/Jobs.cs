using MeningOilam.Application.Abstractions;
using MeningOilam.Domain.Entities;
using MeningOilam.Domain.Enums;
using MeningOilam.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace MeningOilam.Infrastructure.Jobs;

public interface IBackgroundJob
{
    string Name { get; }
    Task<object> ExecuteAsync(CancellationToken ct);
}

/// <summary>daily-reminders cron: birthdays + event reminders, deduped via notification_log.</summary>
public class DailyRemindersJob(AppDbContext db, ITelegramService tg, ILogger<DailyRemindersJob> log) : IBackgroundJob
{
    public string Name => "daily-reminders";

    public async Task<object> ExecuteAsync(CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var nowTime = TimeOnly.FromDateTime(DateTime.UtcNow);
        int families = 0, skipped = 0, sent = 0;

        var all = await db.Families.AsNoTracking().Where(f => f.TelegramGroupId != null)
            .Join(db.FamilySettings, f => f.Id, s => s.FamilyId, (f, s) => new { f, s }).ToListAsync(ct);

        foreach (var x in all)
        {
            families++;
            if (x.s.QuietHoursStart is { } qs && x.s.QuietHoursEnd is { } qe && InQuietHours(nowTime, qs, qe)) { skipped++; continue; }

            if (x.s.FeatureBirthdays)
            {
                var bdays = await db.FamilyMembers.AsNoTracking()
                    .Where(m => m.FamilyId == x.f.Id && m.BirthDate != null && m.Status == MemberStatus.Active).ToListAsync(ct);
                foreach (var m in bdays.Where(m => m.BirthDate!.Value.Month == today.Month && m.BirthDate!.Value.Day == today.Day))
                {
                    if (await Deduped(x.f.Id, "birthday", m.Id, today, ct)) continue;
                    await tg.SendMessageAsync(x.f.TelegramGroupId!.Value,
                        $"🎂 Bugun <b>{m.FullName}</b>ning tug'ilgan kuni! Tabriklaymiz!",
                        new[] { new[] { new TgButton("🎉 Tabriklash", $"bday:{m.Id}") } }, ct: ct);
                    sent++;
                }
            }

            if (x.s.FeatureEvents)
            {
                var events = await db.Events.AsNoTracking().Where(e => e.FamilyId == x.f.Id && e.NotifyGroup).ToListAsync(ct);
                foreach (var e in events)
                {
                    var daysUntil = (DateOnly.FromDateTime(e.EventAt.UtcDateTime).DayNumber - today.DayNumber);
                    if (!e.NotifyDaysBefore.Contains(daysUntil)) continue;
                    if (await Deduped(x.f.Id, "event_reminder", e.Id, today, ct)) continue;
                    await tg.SendMessageAsync(x.f.TelegramGroupId!.Value,
                        $"📅 <b>{e.Title}</b> — {daysUntil} kundan keyin.{(e.Location is null ? "" : $"\n📍 {e.Location}")}", ct: ct);
                    sent++;
                }
            }
        }
        log.LogInformation("daily-reminders: {Families} families, {Sent} sent, {Skipped} skipped", families, sent, skipped);
        return new { families, sent, skipped };
    }

    private async Task<bool> Deduped(Guid familyId, string kind, Guid refId, DateOnly date, CancellationToken ct)
    {
        if (await db.NotificationLogs.AnyAsync(n => n.Kind == kind && n.RefId == refId && n.NotifyDate == date, ct)) return true;
        db.NotificationLogs.Add(new NotificationLog { FamilyId = familyId, Kind = kind, RefId = refId, NotifyDate = date });
        await db.SaveChangesAsync(ct);
        return false;
    }

    private static bool InQuietHours(TimeOnly now, TimeOnly start, TimeOnly end) =>
        start <= end ? now >= start && now < end : now >= start || now < end;
}

/// <summary>process-join-requests cron: auto-approve/reject aged requests.</summary>
public class ProcessJoinRequestsJob(AppDbContext db, ITelegramService tg, ILogger<ProcessJoinRequestsJob> log) : IBackgroundJob
{
    public string Name => "process-join-requests";

    public async Task<object> ExecuteAsync(CancellationToken ct)
    {
        int approved = 0, rejected = 0;
        var settings = await db.FamilySettings.AsNoTracking()
            .Where(s => s.JoinRequestAutoApproveTimeoutHours > 0 || s.JoinRequestAutoRejectTimeoutHours > 0).ToListAsync(ct);

        foreach (var s in settings)
        {
            var pending = await db.JoinRequests.Where(j => j.FamilyId == s.FamilyId && j.Status == JoinRequestStatus.AwaitingAdminApproval).ToListAsync(ct);
            foreach (var req in pending)
            {
                var ageH = (DateTimeOffset.UtcNow - req.CreatedAt).TotalHours;
                if (s.JoinRequestAutoRejectTimeoutHours > 0 && ageH >= s.JoinRequestAutoRejectTimeoutHours)
                {
                    req.Status = JoinRequestStatus.Rejected; req.RejectReason = "Avtomatik rad (vaqt tugadi)"; req.DecidedAt = DateTimeOffset.UtcNow;
                    await tg.SendMessageAsync(req.ApplicantTelegramId, "❌ So'rovingiz vaqt tugashi sababli rad etildi.", ct: ct);
                    rejected++;
                }
                else if (s.JoinRequestAutoApproveTimeoutHours > 0 && ageH >= s.JoinRequestAutoApproveTimeoutHours)
                {
                    req.Status = JoinRequestStatus.Approved; req.DecidedAt = DateTimeOffset.UtcNow;
                    var member = await db.FamilyMembers.FirstOrDefaultAsync(m => m.FamilyId == req.FamilyId && m.TelegramId == req.ApplicantTelegramId, ct);
                    if (member is null) db.FamilyMembers.Add(new FamilyMember { FamilyId = req.FamilyId, TelegramId = req.ApplicantTelegramId, FullName = req.ApplicantFullName ?? "A'zo", Status = MemberStatus.Active });
                    else member.Status = MemberStatus.Active;
                    approved++;
                }
            }
            await db.SaveChangesAsync(ct);
        }
        log.LogInformation("process-join-requests: {Approved} approved, {Rejected} rejected", approved, rejected);
        return new { approved, rejected };
    }
}

/// <summary>sentiment-analysis cron: score yesterday's buffered messages, write to stats, clear buffer.</summary>
public class SentimentAnalysisJob(AppDbContext db, ISentimentAnalyzer ai, ILogger<SentimentAnalysisJob> log) : IBackgroundJob
{
    public string Name => "sentiment-analysis";

    public async Task<object> ExecuteAsync(CancellationToken ct)
    {
        if (!ai.Enabled) { log.LogInformation("sentiment-analysis: AI disabled, skipping"); return new { skipped = true }; }
        var day = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1));
        var buffered = await db.DailyMessageBuffers.AsNoTracking().Where(b => b.MessageDate == day).Take(5000).ToListAsync(ct);

        int updated = 0;
        foreach (var familyGroup in buffered.GroupBy(b => b.FamilyId))
        {
            var inputs = familyGroup.GroupBy(b => b.TelegramId)
                .Where(g => g.Count() >= 3) // anonymity guardrail
                .Select(g => new SentimentInput(g.Key, g.Select(x => x.Text).ToList())).ToList();
            if (inputs.Count == 0) continue;

            var scores = await ai.ScoreAsync(inputs, ct);
            foreach (var (telegramId, score) in scores)
            {
                var stat = await db.MessagesStats.FirstOrDefaultAsync(s => s.FamilyId == familyGroup.Key && s.TelegramId == telegramId && s.MessageDate == day, ct);
                if (stat is null) db.MessagesStats.Add(new MessagesStat { FamilyId = familyGroup.Key, TelegramId = telegramId, MessageDate = day, SentimentScore = (decimal)score, SentimentAnalyzedAt = DateTimeOffset.UtcNow });
                else { stat.SentimentScore = (decimal)score; stat.SentimentAnalyzedAt = DateTimeOffset.UtcNow; }
                updated++;
            }
            await db.SaveChangesAsync(ct);
        }

        // Clear processed + stale buffer (privacy: raw text not persisted)
        await db.DailyMessageBuffers.Where(b => b.MessageDate <= day.AddDays(-1) || b.MessageDate == day).ExecuteDeleteAsync(ct);
        log.LogInformation("sentiment-analysis: day={Day}, updated={Updated}", day, updated);
        return new { day, updated };
    }
}

/// <summary>annual-awards cron: compute yearly nominations + announce.</summary>
public class AnnualAwardsJob(AppDbContext db, ITelegramService tg, ILogger<AnnualAwardsJob> log) : IBackgroundJob
{
    public string Name => "annual-awards";

    public async Task<object> ExecuteAsync(CancellationToken ct)
    {
        var year = DateTime.UtcNow.Year - 1;
        var from = new DateOnly(year, 1, 1);
        var to = new DateOnly(year, 12, 31);
        int families = 0;

        var familyList = await db.Families.AsNoTracking().Where(f => f.TelegramGroupId != null).ToListAsync(ct);
        foreach (var family in familyList)
        {
            families++;
            var stats = await db.MessagesStats.AsNoTracking()
                .Where(s => s.FamilyId == family.Id && s.MessageDate >= from && s.MessageDate <= to).ToListAsync(ct);
            if (stats.Count == 0) continue;

            var topUser = stats.GroupBy(s => s.TelegramId).Select(g => new { tid = g.Key, total = g.Sum(x => x.MessagesCount) })
                .OrderByDescending(x => x.total).FirstOrDefault();
            if (topUser?.tid is null) continue;
            var member = await db.FamilyMembers.AsNoTracking().FirstOrDefaultAsync(m => m.FamilyId == family.Id && m.TelegramId == topUser.tid, ct);

            await UpsertNomination(family.Id, year, "Eng faol a'zo", member?.Id, member?.FullName, topUser.total, ct);

            if (member is not null)
                await tg.SendMessageAsync(family.TelegramGroupId!.Value,
                    $"🏆 {year}-yil natijalari!\n\n🥇 Eng faol a'zo: <b>{member.FullName}</b> ({topUser.total} xabar)", ct: ct);
        }
        log.LogInformation("annual-awards: year={Year}, families={Families}", year, families);
        return new { year, families };
    }

    private async Task UpsertNomination(Guid familyId, int year, string category, Guid? memberId, string? memberName, decimal metric, CancellationToken ct)
    {
        var existing = await db.Nominations.FirstOrDefaultAsync(n => n.FamilyId == familyId && n.Year == year && n.Category == category, ct);
        if (existing is null) db.Nominations.Add(new Nomination { FamilyId = familyId, Year = year, Category = category, MemberId = memberId, MemberName = memberName, MetricValue = metric });
        else { existing.MemberId = memberId; existing.MemberName = memberName; existing.MetricValue = metric; }
        await db.SaveChangesAsync(ct);
    }
}
