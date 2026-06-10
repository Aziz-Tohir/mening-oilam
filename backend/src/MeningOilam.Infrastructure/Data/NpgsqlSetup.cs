using MeningOilam.Domain.Enums;
using Npgsql;
using Npgsql.NameTranslation;

namespace MeningOilam.Infrastructure.Data;

public static class NpgsqlSetup
{
    public static readonly NpgsqlSnakeCaseNameTranslator SnakeCase = new();

    /// <summary>Maps all Postgres native enum types so Npgsql can read/write them at runtime.</summary>
    public static NpgsqlDataSourceBuilder MapEnums(this NpgsqlDataSourceBuilder b)
    {
        b.MapEnum<AppRole>("app_role", SnakeCase);
        b.MapEnum<GenderType>("gender_type", SnakeCase);
        b.MapEnum<MemberStatus>("member_status", SnakeCase);
        b.MapEnum<BotIntegrationMode>("bot_integration_mode", SnakeCase);
        b.MapEnum<NotificationType>("notification_type", SnakeCase);
        b.MapEnum<RsvpStatus>("rsvp_status", SnakeCase);
        b.MapEnum<JoinRequestStatus>("join_request_status", SnakeCase);
        b.MapEnum<RelationshipType>("relationship_type", SnakeCase);
        return b;
    }

    public static NpgsqlDataSource BuildDataSource(string connectionString)
    {
        var b = new NpgsqlDataSourceBuilder(connectionString);
        b.MapEnums();
        return b.Build();
    }
}
