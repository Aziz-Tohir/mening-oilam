using MeningOilam.Api.Common;
using MeningOilam.Application.Abstractions;
using MeningOilam.Domain.Entities;
using MeningOilam.Infrastructure.Caching;
using MeningOilam.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace MeningOilam.Api.Endpoints;

public record SettingsPatch(
    string? Language, int? WelcomeMessageAutoDeleteSeconds, bool? DeleteJoinLeaveMessages, bool? SoftModerationEnabled,
    int? JoinRequestAutoApproveTimeoutHours, int? JoinRequestAutoRejectTimeoutHours,
    bool? FeatureBirthdays, bool? FeatureEvents, bool? FeatureStatsPublic,
    TimeOnly? QuietHoursStart, TimeOnly? QuietHoursEnd, TimeOnly? BirthdayNotifyTime,
    bool? AntiLink, bool? AntiForward, int? AntiFloodSeconds, int? MaxWarnings, string? WarningAction, string[]? AllowedLinkDomains,
    string? FemalePhotoVisibility, bool? EnforceBotOnboarding, bool? ManageForeignBotMedia,
    bool? AutoVideoDownload, bool? VideoDownloadDeleteOriginal,
    long? LogTelegramChatId, long? AdminNotificationChannelId, long? BackupTelegramChatId, string? BackupFrequency,
    int? LogTopicActions, int? LogTopicAdmin, int? LogTopicModeration, int? LogTopicBackup);

public static class SettingsEndpoints
{
    public static void MapSettingsEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/families/{familyId:guid}/settings").RequireAuthorization();

        g.MapGet("/", async (Guid familyId, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            var s = await db.FamilySettings.FirstOrDefaultAsync(x => x.FamilyId == familyId, ct);
            if (s is null) { s = new FamilySettings { FamilyId = familyId }; db.FamilySettings.Add(s); await db.SaveChangesAsync(ct); }
            return Results.Ok(new { settings = s });
        });

        g.MapPatch("/", async (Guid familyId, SettingsPatch p, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, BotCache cache, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            var s = await db.FamilySettings.FirstOrDefaultAsync(x => x.FamilyId == familyId, ct);
            if (s is null) { s = new FamilySettings { FamilyId = familyId }; db.FamilySettings.Add(s); }

            if (p.Language is not null) s.Language = p.Language;
            if (p.WelcomeMessageAutoDeleteSeconds is not null) s.WelcomeMessageAutoDeleteSeconds = p.WelcomeMessageAutoDeleteSeconds.Value;
            if (p.DeleteJoinLeaveMessages is not null) s.DeleteJoinLeaveMessages = p.DeleteJoinLeaveMessages.Value;
            if (p.SoftModerationEnabled is not null) s.SoftModerationEnabled = p.SoftModerationEnabled.Value;
            if (p.JoinRequestAutoApproveTimeoutHours is not null) s.JoinRequestAutoApproveTimeoutHours = p.JoinRequestAutoApproveTimeoutHours.Value;
            if (p.JoinRequestAutoRejectTimeoutHours is not null) s.JoinRequestAutoRejectTimeoutHours = p.JoinRequestAutoRejectTimeoutHours.Value;
            if (p.FeatureBirthdays is not null) s.FeatureBirthdays = p.FeatureBirthdays.Value;
            if (p.FeatureEvents is not null) s.FeatureEvents = p.FeatureEvents.Value;
            if (p.FeatureStatsPublic is not null) s.FeatureStatsPublic = p.FeatureStatsPublic.Value;
            if (p.QuietHoursStart is not null) s.QuietHoursStart = p.QuietHoursStart;
            if (p.QuietHoursEnd is not null) s.QuietHoursEnd = p.QuietHoursEnd;
            if (p.BirthdayNotifyTime is not null) s.BirthdayNotifyTime = p.BirthdayNotifyTime.Value;
            if (p.AntiLink is not null) s.AntiLink = p.AntiLink.Value;
            if (p.AntiForward is not null) s.AntiForward = p.AntiForward.Value;
            if (p.AntiFloodSeconds is not null) s.AntiFloodSeconds = p.AntiFloodSeconds.Value;
            if (p.MaxWarnings is not null) s.MaxWarnings = p.MaxWarnings.Value;
            if (p.WarningAction is not null) s.WarningAction = p.WarningAction;
            if (p.AllowedLinkDomains is not null) s.AllowedLinkDomains = p.AllowedLinkDomains;
            if (p.FemalePhotoVisibility is not null) s.FemalePhotoVisibility = p.FemalePhotoVisibility;
            if (p.EnforceBotOnboarding is not null) s.EnforceBotOnboarding = p.EnforceBotOnboarding.Value;
            if (p.ManageForeignBotMedia is not null) s.ManageForeignBotMedia = p.ManageForeignBotMedia.Value;
            if (p.AutoVideoDownload is not null) s.AutoVideoDownload = p.AutoVideoDownload.Value;
            if (p.VideoDownloadDeleteOriginal is not null) s.VideoDownloadDeleteOriginal = p.VideoDownloadDeleteOriginal.Value;
            if (p.LogTelegramChatId is not null) s.LogTelegramChatId = p.LogTelegramChatId;
            if (p.AdminNotificationChannelId is not null) s.AdminNotificationChannelId = p.AdminNotificationChannelId;
            if (p.BackupTelegramChatId is not null) s.BackupTelegramChatId = p.BackupTelegramChatId;
            if (p.BackupFrequency is not null) s.BackupFrequency = p.BackupFrequency;
            if (p.LogTopicActions is not null) s.LogTopicActions = p.LogTopicActions;
            if (p.LogTopicAdmin is not null) s.LogTopicAdmin = p.LogTopicAdmin;
            if (p.LogTopicModeration is not null) s.LogTopicModeration = p.LogTopicModeration;
            if (p.LogTopicBackup is not null) s.LogTopicBackup = p.LogTopicBackup;

            await db.SaveChangesAsync(ct);
            await cache.InvalidateFamilyAsync(familyId);
            return Results.Ok(new { ok = true });
        });
    }
}

public static class LogEndpoints
{
    public static void MapLogEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/families/{familyId:guid}/logs", async (Guid familyId, int limit, ICurrentUser cu, AppDbContext db, IFamilyAuthorization authz, CancellationToken ct) =>
        {
            await authz.EnsureFamilyAdminAsync(cu.RequireUserId(), familyId, ct);
            if (limit <= 0) limit = 100;
            var logs = await db.ActionLogs.AsNoTracking().Where(l => l.FamilyId == familyId)
                .OrderByDescending(l => l.CreatedAt).Take(limit)
                .Select(l => new { l.Id, l.Action, l.ActorUserId, l.ActorTelegramId, l.Details, l.CreatedAt }).ToListAsync(ct);
            return Results.Ok(new { logs });
        }).RequireAuthorization();
    }
}
