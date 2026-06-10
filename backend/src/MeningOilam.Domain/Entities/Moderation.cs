using System.Text.Json;

namespace MeningOilam.Domain.Entities;

public class MemberWarning
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FamilyId { get; set; }
    public Guid MemberId { get; set; }
    public long? TelegramId { get; set; }
    public string Reason { get; set; } = default!;
    public Guid? IssuedByUserId { get; set; }
    public long? IssuedByTelegramId { get; set; }
    public bool Auto { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class BannedWord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FamilyId { get; set; }
    public string Pattern { get; set; } = default!;
    public bool IsRegex { get; set; }
    public string Action { get; set; } = "delete"; // delete | warn | kick
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class BotBroadcast
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FamilyId { get; set; }
    public string Target { get; set; } = default!; // group | members | all
    public string MessageText { get; set; } = default!;
    public Guid? SentByUserId { get; set; }
    public int RecipientsCount { get; set; }
    public int FailuresCount { get; set; }
    public string? GenderFilter { get; set; }
    public JsonDocument? FailedTargets { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
