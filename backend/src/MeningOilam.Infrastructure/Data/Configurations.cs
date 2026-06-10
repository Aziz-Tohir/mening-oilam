using MeningOilam.Domain.Entities;
using MeningOilam.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MeningOilam.Infrastructure.Data;

public class AppUserConfig : IEntityTypeConfiguration<AppUser>
{
    public void Configure(EntityTypeBuilder<AppUser> e)
    {
        e.HasKey(x => x.Id);
        e.HasIndex(x => x.Email).IsUnique();
        e.Property(x => x.Email).HasMaxLength(255);
        e.HasOne(x => x.Profile).WithOne(p => p.User!).HasForeignKey<Profile>(p => p.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class RefreshTokenConfig : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> e)
    {
        e.HasKey(x => x.Id);
        e.HasIndex(x => x.TokenHash).IsUnique();
        e.HasOne(x => x.User).WithMany(u => u.RefreshTokens).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class ProfileConfig : IEntityTypeConfiguration<Profile>
{
    public void Configure(EntityTypeBuilder<Profile> e)
    {
        e.HasKey(x => x.Id);
        e.HasIndex(x => x.UserId).IsUnique();
        e.HasIndex(x => x.TelegramId).IsUnique().HasFilter(null);
    }
}

public class UserRoleConfig : IEntityTypeConfiguration<UserRole>
{
    public void Configure(EntityTypeBuilder<UserRole> e)
    {
        e.HasKey(x => x.Id);
        e.HasIndex(x => new { x.UserId, x.FamilyId, x.Role }).IsUnique();
        e.HasOne(x => x.User).WithMany(u => u.Roles).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        e.HasOne(x => x.Family).WithMany().HasForeignKey(x => x.FamilyId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class FamilyConfig : IEntityTypeConfiguration<Family>
{
    public void Configure(EntityTypeBuilder<Family> e)
    {
        e.HasKey(x => x.Id);
        e.Property(x => x.Name).HasMaxLength(128);
        e.HasIndex(x => x.InviteCode).IsUnique();
        e.HasIndex(x => x.TelegramGroupId).IsUnique().HasFilter(null);
        e.HasOne(x => x.Owner).WithMany().HasForeignKey(x => x.OwnerUserId).OnDelete(DeleteBehavior.Restrict);
        e.HasOne(x => x.Settings).WithOne(s => s.Family!).HasForeignKey<FamilySettings>(s => s.FamilyId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class FamilyMemberConfig : IEntityTypeConfiguration<FamilyMember>
{
    public void Configure(EntityTypeBuilder<FamilyMember> e)
    {
        e.HasKey(x => x.Id);
        e.Property(x => x.FullName).HasMaxLength(128);
        e.Property(x => x.Username).HasMaxLength(64);
        e.Property(x => x.Phone).HasMaxLength(20);
        e.HasIndex(x => new { x.FamilyId, x.TelegramId }).IsUnique();
        e.HasIndex(x => x.FamilyId);
        e.HasIndex(x => x.TelegramId);
        e.HasOne(x => x.Family).WithMany(f => f.Members).HasForeignKey(x => x.FamilyId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class RelationshipConfig : IEntityTypeConfiguration<Relationship>
{
    public void Configure(EntityTypeBuilder<Relationship> e)
    {
        e.HasKey(x => x.Id);
        e.HasIndex(x => x.FamilyId);
        e.HasIndex(x => x.MemberId1);
        e.HasIndex(x => x.MemberId2);
        e.HasIndex(x => new { x.MemberId1, x.MemberId2, x.RelationshipType }).IsUnique();
        e.ToTable(t => t.HasCheckConstraint("ck_relationship_distinct", "member_id1 <> member_id2"));
    }
}

public class FamilySettingsConfig : IEntityTypeConfiguration<FamilySettings>
{
    public void Configure(EntityTypeBuilder<FamilySettings> e)
    {
        e.HasKey(x => x.FamilyId);
        e.Property(x => x.Language).HasMaxLength(8);
        e.Property(x => x.WarningAction).HasMaxLength(16);
    }
}

public class JoinRequestConfig : IEntityTypeConfiguration<JoinRequest>
{
    public void Configure(EntityTypeBuilder<JoinRequest> e)
    {
        e.HasKey(x => x.Id);
        e.HasIndex(x => x.FamilyId);
        e.HasIndex(x => x.Status);
        e.Property(x => x.ApplicantUsername).HasMaxLength(64);
        e.Property(x => x.ApplicantFullName).HasMaxLength(128);
    }
}

public class BotIntegrationConfig : IEntityTypeConfiguration<BotIntegration>
{
    public void Configure(EntityTypeBuilder<BotIntegration> e)
    {
        e.HasKey(x => x.Id);
        e.Property(x => x.BotUsername).HasMaxLength(64);
        e.HasIndex(x => new { x.FamilyId, x.BotUsername }).IsUnique();
    }
}

public class BotSessionConfig : IEntityTypeConfiguration<BotSession>
{
    public void Configure(EntityTypeBuilder<BotSession> e)
    {
        e.HasKey(x => x.TelegramId);
        e.Property(x => x.TelegramId).ValueGeneratedNever();
        e.Property(x => x.Step).HasMaxLength(60);
        e.Property(x => x.Data).HasColumnType("jsonb");
    }
}

public class KinshipSessionConfig : IEntityTypeConfiguration<KinshipSession>
{
    public void Configure(EntityTypeBuilder<KinshipSession> e)
    {
        e.HasKey(x => x.UserTelegramId);
        e.Property(x => x.UserTelegramId).ValueGeneratedNever();
    }
}

public class PendingAvatarUploadConfig : IEntityTypeConfiguration<PendingAvatarUpload>
{
    public void Configure(EntityTypeBuilder<PendingAvatarUpload> e)
    {
        e.HasKey(x => x.Id);
        e.HasIndex(x => x.TelegramId);
    }
}

public class TelegramBotStateConfig : IEntityTypeConfiguration<TelegramBotState>
{
    public void Configure(EntityTypeBuilder<TelegramBotState> e)
    {
        e.HasKey(x => x.Id);
        e.Property(x => x.Id).ValueGeneratedNever();
    }
}

public class TelegramUpdateRawConfig : IEntityTypeConfiguration<TelegramUpdateRaw>
{
    public void Configure(EntityTypeBuilder<TelegramUpdateRaw> e)
    {
        e.HasKey(x => x.UpdateId);
        e.Property(x => x.UpdateId).ValueGeneratedNever();
        e.Property(x => x.Payload).HasColumnType("jsonb");
        e.HasIndex(x => x.ProcessedAt);
    }
}

public class VideoDownloadJobConfig : IEntityTypeConfiguration<VideoDownloadJob>
{
    public void Configure(EntityTypeBuilder<VideoDownloadJob> e)
    {
        e.HasKey(x => x.Id);
        e.Property(x => x.Status).HasMaxLength(16);
        e.Property(x => x.Url).HasMaxLength(2048);
        e.HasIndex(x => x.Status);
        e.HasIndex(x => new { x.FamilyId, x.CreatedAt });
    }
}

public class MemberWarningConfig : IEntityTypeConfiguration<MemberWarning>
{
    public void Configure(EntityTypeBuilder<MemberWarning> e)
    {
        e.HasKey(x => x.Id);
        e.HasIndex(x => new { x.FamilyId, x.MemberId, x.CreatedAt });
    }
}

public class BannedWordConfig : IEntityTypeConfiguration<BannedWord>
{
    public void Configure(EntityTypeBuilder<BannedWord> e)
    {
        e.HasKey(x => x.Id);
        e.Property(x => x.Action).HasMaxLength(16);
        e.HasIndex(x => x.FamilyId);
    }
}

public class BotBroadcastConfig : IEntityTypeConfiguration<BotBroadcast>
{
    public void Configure(EntityTypeBuilder<BotBroadcast> e)
    {
        e.HasKey(x => x.Id);
        e.Property(x => x.Target).HasMaxLength(16);
        e.Property(x => x.FailedTargets).HasColumnType("jsonb");
    }
}

public class EventConfig : IEntityTypeConfiguration<Event>
{
    public void Configure(EntityTypeBuilder<Event> e)
    {
        e.HasKey(x => x.Id);
        e.Property(x => x.Title).HasMaxLength(200);
        e.HasIndex(x => new { x.FamilyId, x.EventAt });
    }
}

public class EventRsvpConfig : IEntityTypeConfiguration<EventRsvp>
{
    public void Configure(EntityTypeBuilder<EventRsvp> e)
    {
        e.HasKey(x => x.Id);
        e.HasIndex(x => new { x.EventId, x.MemberId }).IsUnique();
        e.HasIndex(x => x.EventId);
        e.HasOne<Event>().WithMany().HasForeignKey(x => x.EventId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class BirthdayGreetingConfig : IEntityTypeConfiguration<BirthdayGreeting>
{
    public void Configure(EntityTypeBuilder<BirthdayGreeting> e)
    {
        e.HasKey(x => x.Id);
        e.HasIndex(x => new { x.MemberId, x.GreeterTelegramId, x.GreetingYear }).IsUnique();
        e.HasIndex(x => new { x.FamilyId, x.GreetingYear });
    }
}

public class MessagesStatConfig : IEntityTypeConfiguration<MessagesStat>
{
    public void Configure(EntityTypeBuilder<MessagesStat> e)
    {
        e.HasKey(x => x.Id);
        e.HasIndex(x => new { x.FamilyId, x.TelegramId, x.MessageDate }).IsUnique();
        e.HasIndex(x => new { x.FamilyId, x.MessageDate });
    }
}

public class DailyMessageBufferConfig : IEntityTypeConfiguration<DailyMessageBuffer>
{
    public void Configure(EntityTypeBuilder<DailyMessageBuffer> e)
    {
        e.HasKey(x => x.Id);
        e.HasIndex(x => new { x.FamilyId, x.TelegramId, x.MessageDate, x.TextHash }).IsUnique();
        e.HasIndex(x => new { x.FamilyId, x.MessageDate });
    }
}

public class NominationConfig : IEntityTypeConfiguration<Nomination>
{
    public void Configure(EntityTypeBuilder<Nomination> e)
    {
        e.HasKey(x => x.Id);
        e.HasIndex(x => new { x.FamilyId, x.Year, x.Category }).IsUnique();
        e.Property(x => x.Details).HasColumnType("jsonb");
    }
}

public class MemoryConfig : IEntityTypeConfiguration<Memory>
{
    public void Configure(EntityTypeBuilder<Memory> e)
    {
        e.HasKey(x => x.Id);
        e.HasIndex(x => new { x.FamilyId, x.MessageYear });
    }
}

public class ActionLogConfig : IEntityTypeConfiguration<ActionLog>
{
    public void Configure(EntityTypeBuilder<ActionLog> e)
    {
        e.HasKey(x => x.Id);
        e.Property(x => x.Action).HasMaxLength(64);
        e.Property(x => x.Details).HasColumnType("jsonb");
        e.HasIndex(x => new { x.FamilyId, x.CreatedAt });
    }
}

public class AdminNotificationConfig : IEntityTypeConfiguration<AdminNotification>
{
    public void Configure(EntityTypeBuilder<AdminNotification> e)
    {
        e.HasKey(x => x.Id);
        e.HasIndex(x => new { x.FamilyId, x.IsRead });
    }
}

public class NotificationLogConfig : IEntityTypeConfiguration<NotificationLog>
{
    public void Configure(EntityTypeBuilder<NotificationLog> e)
    {
        e.HasKey(x => x.Id);
        e.HasIndex(x => new { x.Kind, x.RefId, x.NotifyDate }).IsUnique();
    }
}
