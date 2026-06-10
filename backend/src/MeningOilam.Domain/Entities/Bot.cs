using System.Text.Json;
using MeningOilam.Domain.Enums;

namespace MeningOilam.Domain.Entities;

public class JoinRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FamilyId { get; set; }
    public long ApplicantTelegramId { get; set; }
    public string? ApplicantUsername { get; set; }
    public string? ApplicantFullName { get; set; }
    public string? ApplicantPhone { get; set; }
    public Guid? RelativeMemberId { get; set; }
    public string? RelativeHint { get; set; }
    public RelationshipType? RelationshipType { get; set; }
    public JoinRequestStatus Status { get; set; } = JoinRequestStatus.AwaitingRelativeChoice;
    public Guid? DecidedBy { get; set; }
    public DateTimeOffset? DecidedAt { get; set; }
    public string? RejectReason { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class BotIntegration
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FamilyId { get; set; }
    public string BotUsername { get; set; } = default!;
    public BotIntegrationMode Mode { get; set; } = BotIntegrationMode.MediaOnly;
    public bool IsActive { get; set; } = true;
    public Guid? AddedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Bot conversation state machine per telegram user.</summary>
public class BotSession
{
    public long TelegramId { get; set; }
    public string Step { get; set; } = default!;
    public JsonDocument Data { get; set; } = JsonDocument.Parse("{}");
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class KinshipSession
{
    public long UserTelegramId { get; set; }
    public Guid? FamilyId { get; set; }
    public Guid? FirstMemberId { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class PendingAvatarUpload
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public long TelegramId { get; set; }
    public string FileId { get; set; } = default!;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Singleton row holding the long-poll offset.</summary>
public class TelegramBotState
{
    public int Id { get; set; } = 1;
    public long UpdateOffset { get; set; }
    public DateTimeOffset? LastPolledAt { get; set; }
}

public class TelegramUpdateRaw
{
    public long UpdateId { get; set; }
    public JsonDocument Payload { get; set; } = default!;
    public DateTimeOffset? ProcessedAt { get; set; }
    public string? Error { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
