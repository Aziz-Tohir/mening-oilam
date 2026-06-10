using MeningOilam.Domain.Enums;

namespace MeningOilam.Domain.Entities;

public class Family
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = default!;
    public long? TelegramGroupId { get; set; }
    public string? TelegramGroupTitle { get; set; }
    public Guid OwnerUserId { get; set; }
    public string InviteCode { get; set; } = default!;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public AppUser? Owner { get; set; }
    public FamilySettings? Settings { get; set; }
    public List<FamilyMember> Members { get; set; } = new();
}

public class FamilyMember
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FamilyId { get; set; }
    public long TelegramId { get; set; }
    public string? Username { get; set; }
    public string FullName { get; set; } = default!;
    public GenderType? Gender { get; set; }
    public DateOnly? BirthDate { get; set; }
    public string? Phone { get; set; }
    public string? Bio { get; set; }
    public string? PhotoUrl { get; set; }
    public bool PhotoIsPrivate { get; set; }
    public MemberStatus Status { get; set; } = MemberStatus.Pending;
    public Guid? InvitedBy { get; set; }
    public RelationshipType? RelationshipToInviter { get; set; }
    public bool SentimentOptOut { get; set; }
    public DateTimeOffset JoinedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastSeenAt { get; set; }
    public Guid? UserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Family? Family { get; set; }
}

public class Relationship
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FamilyId { get; set; }
    public Guid MemberId1 { get; set; }
    public Guid MemberId2 { get; set; }
    public RelationshipType RelationshipType { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class FamilySettings
{
    public Guid FamilyId { get; set; }
    public string Language { get; set; } = "uz";
    public TimeOnly BirthdayNotifyTime { get; set; } = new(9, 0);
    public int WelcomeMessageAutoDeleteSeconds { get; set; } = 120;
    public bool DeleteJoinLeaveMessages { get; set; } = true;
    public bool SoftModerationEnabled { get; set; } = true;
    public int JoinRequestAutoApproveTimeoutHours { get; set; }
    public int JoinRequestAutoRejectTimeoutHours { get; set; }
    public bool FeatureBirthdays { get; set; } = true;
    public bool FeatureEvents { get; set; } = true;
    public bool FeatureStatsPublic { get; set; }
    public TimeOnly? QuietHoursStart { get; set; }
    public TimeOnly? QuietHoursEnd { get; set; }

    // Moderation
    public bool AntiLink { get; set; }
    public bool AntiForward { get; set; }
    public int AntiFloodSeconds { get; set; }
    public int MaxWarnings { get; set; } = 3;
    public string WarningAction { get; set; } = "kick"; // kick | ban | mute
    public string[] AllowedLinkDomains { get; set; } = Array.Empty<string>();

    // Photo visibility: public | private_default | female_only | always_hidden
    public string FemalePhotoVisibility { get; set; } = "public";

    // Clean video relay (cobalt): auto-download videos from links posted in the group
    public bool AutoVideoDownload { get; set; }
    public bool VideoDownloadDeleteOriginal { get; set; }

    // Bot / Telegram logging
    public bool EnforceBotOnboarding { get; set; } = true;
    public bool ManageForeignBotMedia { get; set; } = true;
    public long? LogTelegramChatId { get; set; }
    public long? AdminNotificationChannelId { get; set; }
    public long? BackupTelegramChatId { get; set; }
    public string BackupFrequency { get; set; } = "weekly";
    public int? LogTopicActions { get; set; }
    public int? LogTopicAdmin { get; set; }
    public int? LogTopicModeration { get; set; }
    public int? LogTopicBackup { get; set; }

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Family? Family { get; set; }
}
