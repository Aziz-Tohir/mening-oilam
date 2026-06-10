using System.Text.Json;

namespace MeningOilam.Domain.Entities;

public class MessagesStat
{
    public long Id { get; set; }
    public Guid FamilyId { get; set; }
    public Guid? MemberId { get; set; }
    public long? TelegramId { get; set; }
    public DateOnly MessageDate { get; set; }
    public int MessagesCount { get; set; }
    public decimal? SentimentScore { get; set; }
    public DateTimeOffset? SentimentAnalyzedAt { get; set; }
}

public class DailyMessageBuffer
{
    public long Id { get; set; }
    public Guid FamilyId { get; set; }
    public long TelegramId { get; set; }
    public Guid? MemberId { get; set; }
    public DateOnly MessageDate { get; set; }
    public string Text { get; set; } = default!;
    public byte[] TextHash { get; set; } = default!;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class Nomination
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FamilyId { get; set; }
    public int Year { get; set; }
    public string Category { get; set; } = default!;
    public Guid? MemberId { get; set; }
    public string? MemberName { get; set; }
    public decimal? MetricValue { get; set; }
    public JsonDocument? Details { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class Memory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FamilyId { get; set; }
    public long? SavedByTelegramId { get; set; }
    public Guid? SavedByMemberId { get; set; }
    public string Kind { get; set; } = default!; // photo | video | document
    public string TelegramFileId { get; set; } = default!;
    public string? StorageUrl { get; set; }
    public string? Caption { get; set; }
    public int MessageYear { get; set; }
    public long? SourceChatId { get; set; }
    public long? SourceMessageId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class ActionLog
{
    public long Id { get; set; }
    public Guid? FamilyId { get; set; }
    public Guid? ActorUserId { get; set; }
    public long? ActorTelegramId { get; set; }
    public string Action { get; set; } = default!;
    public JsonDocument? Details { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class AdminNotification
{
    public long Id { get; set; }
    public Guid FamilyId { get; set; }
    public Guid? AdminUserId { get; set; }
    public Enums.NotificationType NotificationType { get; set; }
    public string MessageText { get; set; } = default!;
    public Guid? RelatedJoinRequest { get; set; }
    public bool IsRead { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class NotificationLog
{
    public long Id { get; set; }
    public Guid FamilyId { get; set; }
    public string Kind { get; set; } = default!; // birthday | event_reminder
    public Guid RefId { get; set; }
    public DateOnly NotifyDate { get; set; }
    public DateTimeOffset SentAt { get; set; } = DateTimeOffset.UtcNow;
}
