using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace MeningOilam.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:Enum:public.app_role", "superadmin,admin,member")
                .Annotation("Npgsql:Enum:public.bot_integration_mode", "media_only,delete_all,keep_all")
                .Annotation("Npgsql:Enum:public.gender_type", "male,female")
                .Annotation("Npgsql:Enum:public.join_request_status", "awaiting_relative_choice,awaiting_relative_confirm,awaiting_admin_approval,approved,rejected,expired")
                .Annotation("Npgsql:Enum:public.member_status", "pending,active,blocked")
                .Annotation("Npgsql:Enum:public.notification_type", "join_request,approval_needed,spam_detected,error_report,system")
                .Annotation("Npgsql:Enum:public.relationship_type", "father,mother,son,daughter,brother,sister,husband,wife,uncle_paternal,uncle_maternal,aunt_paternal,aunt_maternal,cousin_male,cousin_female,grandfather,grandmother,grandson,granddaughter,father_in_law,mother_in_law,son_in_law,daughter_in_law,brother_in_law,sister_in_law,nephew,niece,other,self,step_father,step_mother,step_son,step_daughter,half_brother,half_sister,great_grandfather,great_grandmother,great_grandson,great_granddaughter,godfather,godmother,family_friend")
                .Annotation("Npgsql:Enum:public.rsvp_status", "yes,no,maybe");

            migrationBuilder.CreateTable(
                name: "action_logs",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    family_id = table.Column<Guid>(type: "uuid", nullable: true),
                    actor_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    actor_telegram_id = table.Column<long>(type: "bigint", nullable: true),
                    action = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    details = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_action_logs", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "admin_notifications",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    admin_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    notification_type = table.Column<int>(type: "integer", nullable: false),
                    message_text = table.Column<string>(type: "text", nullable: false),
                    related_join_request = table.Column<Guid>(type: "uuid", nullable: true),
                    is_read = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_admin_notifications", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "banned_words",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    pattern = table.Column<string>(type: "text", nullable: false),
                    is_regex = table.Column<bool>(type: "boolean", nullable: false),
                    action = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_banned_words", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "birthday_greetings",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    greeter_telegram_id = table.Column<long>(type: "bigint", nullable: false),
                    greeter_name = table.Column<string>(type: "text", nullable: true),
                    greeting_year = table.Column<int>(type: "integer", nullable: false),
                    greeting_text = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_birthday_greetings", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "bot_broadcasts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    target = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    message_text = table.Column<string>(type: "text", nullable: false),
                    sent_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    recipients_count = table.Column<int>(type: "integer", nullable: false),
                    failures_count = table.Column<int>(type: "integer", nullable: false),
                    gender_filter = table.Column<string>(type: "text", nullable: true),
                    failed_targets = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_bot_broadcasts", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "bot_integrations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    bot_username = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    mode = table.Column<int>(type: "integer", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    added_by = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_bot_integrations", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "bot_sessions",
                columns: table => new
                {
                    telegram_id = table.Column<long>(type: "bigint", nullable: false),
                    step = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    data = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_bot_sessions", x => x.telegram_id);
                });

            migrationBuilder.CreateTable(
                name: "daily_message_buffers",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    telegram_id = table.Column<long>(type: "bigint", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: true),
                    message_date = table.Column<DateOnly>(type: "date", nullable: false),
                    text = table.Column<string>(type: "text", nullable: false),
                    text_hash = table.Column<byte[]>(type: "bytea", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_daily_message_buffers", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "events",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    description = table.Column<string>(type: "text", nullable: true),
                    event_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    location = table.Column<string>(type: "text", nullable: true),
                    is_recurring_yearly = table.Column<bool>(type: "boolean", nullable: false),
                    notify_days_before = table.Column<int[]>(type: "integer[]", nullable: false),
                    notify_group = table.Column<bool>(type: "boolean", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_events", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "join_requests",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    applicant_telegram_id = table.Column<long>(type: "bigint", nullable: false),
                    applicant_username = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    applicant_full_name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    applicant_phone = table.Column<string>(type: "text", nullable: true),
                    relative_member_id = table.Column<Guid>(type: "uuid", nullable: true),
                    relative_hint = table.Column<string>(type: "text", nullable: true),
                    relationship_type = table.Column<int>(type: "integer", nullable: true),
                    status = table.Column<int>(type: "integer", nullable: false),
                    decided_by = table.Column<Guid>(type: "uuid", nullable: true),
                    decided_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    reject_reason = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_join_requests", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "kinship_sessions",
                columns: table => new
                {
                    user_telegram_id = table.Column<long>(type: "bigint", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: true),
                    first_member_id = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_kinship_sessions", x => x.user_telegram_id);
                });

            migrationBuilder.CreateTable(
                name: "member_warnings",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    telegram_id = table.Column<long>(type: "bigint", nullable: true),
                    reason = table.Column<string>(type: "text", nullable: false),
                    issued_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    issued_by_telegram_id = table.Column<long>(type: "bigint", nullable: true),
                    auto = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_member_warnings", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "memories",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    saved_by_telegram_id = table.Column<long>(type: "bigint", nullable: true),
                    saved_by_member_id = table.Column<Guid>(type: "uuid", nullable: true),
                    kind = table.Column<string>(type: "text", nullable: false),
                    telegram_file_id = table.Column<string>(type: "text", nullable: false),
                    storage_url = table.Column<string>(type: "text", nullable: true),
                    caption = table.Column<string>(type: "text", nullable: true),
                    message_year = table.Column<int>(type: "integer", nullable: false),
                    source_chat_id = table.Column<long>(type: "bigint", nullable: true),
                    source_message_id = table.Column<long>(type: "bigint", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_memories", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "messages_stats",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: true),
                    telegram_id = table.Column<long>(type: "bigint", nullable: true),
                    message_date = table.Column<DateOnly>(type: "date", nullable: false),
                    messages_count = table.Column<int>(type: "integer", nullable: false),
                    sentiment_score = table.Column<decimal>(type: "numeric", nullable: true),
                    sentiment_analyzed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_messages_stats", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "nominations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    year = table.Column<int>(type: "integer", nullable: false),
                    category = table.Column<string>(type: "text", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: true),
                    member_name = table.Column<string>(type: "text", nullable: true),
                    metric_value = table.Column<decimal>(type: "numeric", nullable: true),
                    details = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_nominations", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "notification_logs",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "text", nullable: false),
                    ref_id = table.Column<Guid>(type: "uuid", nullable: false),
                    notify_date = table.Column<DateOnly>(type: "date", nullable: false),
                    sent_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notification_logs", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "pending_avatar_uploads",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    telegram_id = table.Column<long>(type: "bigint", nullable: false),
                    file_id = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_pending_avatar_uploads", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "relationships",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id1 = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id2 = table.Column<Guid>(type: "uuid", nullable: false),
                    relationship_type = table.Column<int>(type: "integer", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_relationships", x => x.id);
                    table.CheckConstraint("ck_relationship_distinct", "member_id1 <> member_id2");
                });

            migrationBuilder.CreateTable(
                name: "telegram_bot_states",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false),
                    update_offset = table.Column<long>(type: "bigint", nullable: false),
                    last_polled_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_telegram_bot_states", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "telegram_updates_raw",
                columns: table => new
                {
                    update_id = table.Column<long>(type: "bigint", nullable: false),
                    payload = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    processed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    error = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_telegram_updates_raw", x => x.update_id);
                });

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    password_hash = table.Column<string>(type: "text", nullable: true),
                    display_name = table.Column<string>(type: "text", nullable: true),
                    email_confirmed = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_users", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "event_rsvps",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    responded_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_event_rsvps", x => x.id);
                    table.ForeignKey(
                        name: "fk_event_rsvps_events_event_id",
                        column: x => x.event_id,
                        principalTable: "events",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "families",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    telegram_group_id = table.Column<long>(type: "bigint", nullable: true),
                    telegram_group_title = table.Column<string>(type: "text", nullable: true),
                    owner_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    invite_code = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_families", x => x.id);
                    table.ForeignKey(
                        name: "fk_families_users_owner_user_id",
                        column: x => x.owner_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "profiles",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<string>(type: "text", nullable: true),
                    display_name = table.Column<string>(type: "text", nullable: true),
                    telegram_id = table.Column<long>(type: "bigint", nullable: true),
                    telegram_username = table.Column<string>(type: "text", nullable: true),
                    avatar_url = table.Column<string>(type: "text", nullable: true),
                    language = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_profiles", x => x.id);
                    table.ForeignKey(
                        name: "fk_profiles_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "refresh_tokens",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    token_hash = table.Column<string>(type: "text", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    replaced_by_token_hash = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_refresh_tokens", x => x.id);
                    table.ForeignKey(
                        name: "fk_refresh_tokens_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "family_members",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    telegram_id = table.Column<long>(type: "bigint", nullable: false),
                    username = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    full_name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    gender = table.Column<int>(type: "integer", nullable: true),
                    birth_date = table.Column<DateOnly>(type: "date", nullable: true),
                    phone = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    bio = table.Column<string>(type: "text", nullable: true),
                    photo_url = table.Column<string>(type: "text", nullable: true),
                    photo_is_private = table.Column<bool>(type: "boolean", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    invited_by = table.Column<Guid>(type: "uuid", nullable: true),
                    relationship_to_inviter = table.Column<int>(type: "integer", nullable: true),
                    sentiment_opt_out = table.Column<bool>(type: "boolean", nullable: false),
                    joined_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_family_members", x => x.id);
                    table.ForeignKey(
                        name: "fk_family_members_families_family_id",
                        column: x => x.family_id,
                        principalTable: "families",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "family_settings",
                columns: table => new
                {
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    language = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    birthday_notify_time = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    welcome_message_auto_delete_seconds = table.Column<int>(type: "integer", nullable: false),
                    delete_join_leave_messages = table.Column<bool>(type: "boolean", nullable: false),
                    soft_moderation_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    join_request_auto_approve_timeout_hours = table.Column<int>(type: "integer", nullable: false),
                    join_request_auto_reject_timeout_hours = table.Column<int>(type: "integer", nullable: false),
                    feature_birthdays = table.Column<bool>(type: "boolean", nullable: false),
                    feature_events = table.Column<bool>(type: "boolean", nullable: false),
                    feature_stats_public = table.Column<bool>(type: "boolean", nullable: false),
                    quiet_hours_start = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    quiet_hours_end = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    anti_link = table.Column<bool>(type: "boolean", nullable: false),
                    anti_forward = table.Column<bool>(type: "boolean", nullable: false),
                    anti_flood_seconds = table.Column<int>(type: "integer", nullable: false),
                    max_warnings = table.Column<int>(type: "integer", nullable: false),
                    warning_action = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    allowed_link_domains = table.Column<string[]>(type: "text[]", nullable: false),
                    female_photo_visibility = table.Column<string>(type: "text", nullable: false),
                    enforce_bot_onboarding = table.Column<bool>(type: "boolean", nullable: false),
                    manage_foreign_bot_media = table.Column<bool>(type: "boolean", nullable: false),
                    log_telegram_chat_id = table.Column<long>(type: "bigint", nullable: true),
                    admin_notification_channel_id = table.Column<long>(type: "bigint", nullable: true),
                    backup_telegram_chat_id = table.Column<long>(type: "bigint", nullable: true),
                    backup_frequency = table.Column<string>(type: "text", nullable: false),
                    log_topic_actions = table.Column<int>(type: "integer", nullable: true),
                    log_topic_admin = table.Column<int>(type: "integer", nullable: true),
                    log_topic_moderation = table.Column<int>(type: "integer", nullable: true),
                    log_topic_backup = table.Column<int>(type: "integer", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_family_settings", x => x.family_id);
                    table.ForeignKey(
                        name: "fk_family_settings_families_family_id",
                        column: x => x.family_id,
                        principalTable: "families",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_roles",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: true),
                    role = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_roles", x => x.id);
                    table.ForeignKey(
                        name: "fk_user_roles_families_family_id",
                        column: x => x.family_id,
                        principalTable: "families",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_user_roles_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_action_logs_family_id_created_at",
                table: "action_logs",
                columns: new[] { "family_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_admin_notifications_family_id_is_read",
                table: "admin_notifications",
                columns: new[] { "family_id", "is_read" });

            migrationBuilder.CreateIndex(
                name: "ix_banned_words_family_id",
                table: "banned_words",
                column: "family_id");

            migrationBuilder.CreateIndex(
                name: "ix_birthday_greetings_family_id_greeting_year",
                table: "birthday_greetings",
                columns: new[] { "family_id", "greeting_year" });

            migrationBuilder.CreateIndex(
                name: "ix_birthday_greetings_member_id_greeter_telegram_id_greeting_y",
                table: "birthday_greetings",
                columns: new[] { "member_id", "greeter_telegram_id", "greeting_year" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_bot_integrations_family_id_bot_username",
                table: "bot_integrations",
                columns: new[] { "family_id", "bot_username" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_daily_message_buffers_family_id_message_date",
                table: "daily_message_buffers",
                columns: new[] { "family_id", "message_date" });

            migrationBuilder.CreateIndex(
                name: "ix_daily_message_buffers_family_id_telegram_id_message_date_te",
                table: "daily_message_buffers",
                columns: new[] { "family_id", "telegram_id", "message_date", "text_hash" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_event_rsvps_event_id",
                table: "event_rsvps",
                column: "event_id");

            migrationBuilder.CreateIndex(
                name: "ix_event_rsvps_event_id_member_id",
                table: "event_rsvps",
                columns: new[] { "event_id", "member_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_events_family_id_event_at",
                table: "events",
                columns: new[] { "family_id", "event_at" });

            migrationBuilder.CreateIndex(
                name: "ix_families_invite_code",
                table: "families",
                column: "invite_code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_families_owner_user_id",
                table: "families",
                column: "owner_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_families_telegram_group_id",
                table: "families",
                column: "telegram_group_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_family_members_family_id",
                table: "family_members",
                column: "family_id");

            migrationBuilder.CreateIndex(
                name: "ix_family_members_family_id_telegram_id",
                table: "family_members",
                columns: new[] { "family_id", "telegram_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_family_members_telegram_id",
                table: "family_members",
                column: "telegram_id");

            migrationBuilder.CreateIndex(
                name: "ix_join_requests_family_id",
                table: "join_requests",
                column: "family_id");

            migrationBuilder.CreateIndex(
                name: "ix_join_requests_status",
                table: "join_requests",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ix_member_warnings_family_id_member_id_created_at",
                table: "member_warnings",
                columns: new[] { "family_id", "member_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_memories_family_id_message_year",
                table: "memories",
                columns: new[] { "family_id", "message_year" });

            migrationBuilder.CreateIndex(
                name: "ix_messages_stats_family_id_message_date",
                table: "messages_stats",
                columns: new[] { "family_id", "message_date" });

            migrationBuilder.CreateIndex(
                name: "ix_messages_stats_family_id_telegram_id_message_date",
                table: "messages_stats",
                columns: new[] { "family_id", "telegram_id", "message_date" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_nominations_family_id_year_category",
                table: "nominations",
                columns: new[] { "family_id", "year", "category" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_notification_logs_kind_ref_id_notify_date",
                table: "notification_logs",
                columns: new[] { "kind", "ref_id", "notify_date" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_pending_avatar_uploads_telegram_id",
                table: "pending_avatar_uploads",
                column: "telegram_id");

            migrationBuilder.CreateIndex(
                name: "ix_profiles_telegram_id",
                table: "profiles",
                column: "telegram_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_profiles_user_id",
                table: "profiles",
                column: "user_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_refresh_tokens_token_hash",
                table: "refresh_tokens",
                column: "token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_refresh_tokens_user_id",
                table: "refresh_tokens",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_relationships_family_id",
                table: "relationships",
                column: "family_id");

            migrationBuilder.CreateIndex(
                name: "ix_relationships_member_id1",
                table: "relationships",
                column: "member_id1");

            migrationBuilder.CreateIndex(
                name: "ix_relationships_member_id1_member_id2_relationship_type",
                table: "relationships",
                columns: new[] { "member_id1", "member_id2", "relationship_type" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_relationships_member_id2",
                table: "relationships",
                column: "member_id2");

            migrationBuilder.CreateIndex(
                name: "ix_telegram_updates_raw_processed_at",
                table: "telegram_updates_raw",
                column: "processed_at");

            migrationBuilder.CreateIndex(
                name: "ix_user_roles_family_id",
                table: "user_roles",
                column: "family_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_roles_user_id_family_id_role",
                table: "user_roles",
                columns: new[] { "user_id", "family_id", "role" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_users_email",
                table: "users",
                column: "email",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "action_logs");

            migrationBuilder.DropTable(
                name: "admin_notifications");

            migrationBuilder.DropTable(
                name: "banned_words");

            migrationBuilder.DropTable(
                name: "birthday_greetings");

            migrationBuilder.DropTable(
                name: "bot_broadcasts");

            migrationBuilder.DropTable(
                name: "bot_integrations");

            migrationBuilder.DropTable(
                name: "bot_sessions");

            migrationBuilder.DropTable(
                name: "daily_message_buffers");

            migrationBuilder.DropTable(
                name: "event_rsvps");

            migrationBuilder.DropTable(
                name: "family_members");

            migrationBuilder.DropTable(
                name: "family_settings");

            migrationBuilder.DropTable(
                name: "join_requests");

            migrationBuilder.DropTable(
                name: "kinship_sessions");

            migrationBuilder.DropTable(
                name: "member_warnings");

            migrationBuilder.DropTable(
                name: "memories");

            migrationBuilder.DropTable(
                name: "messages_stats");

            migrationBuilder.DropTable(
                name: "nominations");

            migrationBuilder.DropTable(
                name: "notification_logs");

            migrationBuilder.DropTable(
                name: "pending_avatar_uploads");

            migrationBuilder.DropTable(
                name: "profiles");

            migrationBuilder.DropTable(
                name: "refresh_tokens");

            migrationBuilder.DropTable(
                name: "relationships");

            migrationBuilder.DropTable(
                name: "telegram_bot_states");

            migrationBuilder.DropTable(
                name: "telegram_updates_raw");

            migrationBuilder.DropTable(
                name: "user_roles");

            migrationBuilder.DropTable(
                name: "events");

            migrationBuilder.DropTable(
                name: "families");

            migrationBuilder.DropTable(
                name: "users");
        }
    }
}
