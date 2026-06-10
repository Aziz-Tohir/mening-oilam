using MeningOilam.Domain.Enums;

namespace MeningOilam.Domain.Entities;

public class Event
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FamilyId { get; set; }
    public string Title { get; set; } = default!;
    public string? Description { get; set; }
    public DateTimeOffset EventAt { get; set; }
    public string? Location { get; set; }
    public bool IsRecurringYearly { get; set; }
    public int[] NotifyDaysBefore { get; set; } = { 7, 1, 0 };
    public bool NotifyGroup { get; set; } = true;
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class EventRsvp
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EventId { get; set; }
    public Guid FamilyId { get; set; }
    public Guid MemberId { get; set; }
    public RsvpStatus Status { get; set; }
    public DateTimeOffset RespondedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class BirthdayGreeting
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FamilyId { get; set; }
    public Guid MemberId { get; set; }
    public long GreeterTelegramId { get; set; }
    public string? GreeterName { get; set; }
    public int GreetingYear { get; set; }
    public string? GreetingText { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
