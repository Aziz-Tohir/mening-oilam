using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MeningOilam.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddVideoDownload : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "auto_video_download",
                table: "family_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "video_download_delete_original",
                table: "family_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "video_download_jobs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    chat_id = table.Column<long>(type: "bigint", nullable: false),
                    thread_id = table.Column<int>(type: "integer", nullable: true),
                    original_message_id = table.Column<int>(type: "integer", nullable: false),
                    requester_telegram_id = table.Column<long>(type: "bigint", nullable: false),
                    url = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    error = table.Column<string>(type: "text", nullable: true),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    result_message_id = table.Column<int>(type: "integer", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_video_download_jobs", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_video_download_jobs_family_id_created_at",
                table: "video_download_jobs",
                columns: new[] { "family_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_video_download_jobs_status",
                table: "video_download_jobs",
                column: "status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "video_download_jobs");

            migrationBuilder.DropColumn(
                name: "auto_video_download",
                table: "family_settings");

            migrationBuilder.DropColumn(
                name: "video_download_delete_original",
                table: "family_settings");
        }
    }
}
