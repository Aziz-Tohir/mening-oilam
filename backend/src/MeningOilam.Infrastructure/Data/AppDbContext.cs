using MeningOilam.Domain.Entities;
using MeningOilam.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace MeningOilam.Infrastructure.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Profile> Profiles => Set<Profile>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();

    public DbSet<Family> Families => Set<Family>();
    public DbSet<FamilyMember> FamilyMembers => Set<FamilyMember>();
    public DbSet<Relationship> Relationships => Set<Relationship>();
    public DbSet<FamilySettings> FamilySettings => Set<FamilySettings>();

    public DbSet<JoinRequest> JoinRequests => Set<JoinRequest>();
    public DbSet<BotIntegration> BotIntegrations => Set<BotIntegration>();
    public DbSet<BotSession> BotSessions => Set<BotSession>();
    public DbSet<KinshipSession> KinshipSessions => Set<KinshipSession>();
    public DbSet<PendingAvatarUpload> PendingAvatarUploads => Set<PendingAvatarUpload>();
    public DbSet<TelegramBotState> TelegramBotStates => Set<TelegramBotState>();
    public DbSet<TelegramUpdateRaw> TelegramUpdatesRaw => Set<TelegramUpdateRaw>();
    public DbSet<VideoDownloadJob> VideoDownloadJobs => Set<VideoDownloadJob>();

    public DbSet<MemberWarning> MemberWarnings => Set<MemberWarning>();
    public DbSet<BannedWord> BannedWords => Set<BannedWord>();
    public DbSet<BotBroadcast> BotBroadcasts => Set<BotBroadcast>();

    public DbSet<Event> Events => Set<Event>();
    public DbSet<EventRsvp> EventRsvps => Set<EventRsvp>();
    public DbSet<BirthdayGreeting> BirthdayGreetings => Set<BirthdayGreeting>();

    public DbSet<MessagesStat> MessagesStats => Set<MessagesStat>();
    public DbSet<DailyMessageBuffer> DailyMessageBuffers => Set<DailyMessageBuffer>();
    public DbSet<Nomination> Nominations => Set<Nomination>();
    public DbSet<Memory> Memories => Set<Memory>();

    public DbSet<ActionLog> ActionLogs => Set<ActionLog>();
    public DbSet<AdminNotification> AdminNotifications => Set<AdminNotification>();
    public DbSet<NotificationLog> NotificationLogs => Set<NotificationLog>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        // Postgres native enum types (labels via snake_case translator)
        var tr = NpgsqlSetup.SnakeCase;
        b.HasPostgresEnum<AppRole>("public", "app_role", tr);
        b.HasPostgresEnum<GenderType>("public", "gender_type", tr);
        b.HasPostgresEnum<MemberStatus>("public", "member_status", tr);
        b.HasPostgresEnum<BotIntegrationMode>("public", "bot_integration_mode", tr);
        b.HasPostgresEnum<NotificationType>("public", "notification_type", tr);
        b.HasPostgresEnum<RsvpStatus>("public", "rsvp_status", tr);
        b.HasPostgresEnum<JoinRequestStatus>("public", "join_request_status", tr);
        b.HasPostgresEnum<RelationshipType>("public", "relationship_type", tr);

        b.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        TouchTimestamps();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken ct = default)
    {
        TouchTimestamps();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, ct);
    }

    private void TouchTimestamps()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var entry in ChangeTracker.Entries())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified)) continue;
            var prop = entry.Metadata.FindProperty("UpdatedAt");
            if (prop is not null && prop.ClrType == typeof(DateTimeOffset))
                entry.Property("UpdatedAt").CurrentValue = now;
        }
    }
}
