using MeningOilam.Domain.Entities;
using MeningOilam.Domain.Enums;
using MeningOilam.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace MeningOilam.Api.Common;

public static class DatabaseInitializer
{
    public static async Task InitializeDatabaseAsync(this IServiceProvider services, IConfiguration config)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var log = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DbInit");

        try
        {
            await db.Database.MigrateAsync();
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Database migration failed — is PostgreSQL running and reachable?");
            return;
        }

        // Seed a global superadmin if none exists.
        var email = config["Seed:SuperadminEmail"];
        var password = config["Seed:SuperadminPassword"];
        if (!string.IsNullOrWhiteSpace(email) && !string.IsNullOrWhiteSpace(password))
        {
            email = email.ToLowerInvariant();
            if (!await db.Users.AnyAsync(u => u.Email == email))
            {
                var user = new AppUser
                {
                    Email = email,
                    DisplayName = "Super Admin",
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
                    EmailConfirmed = true,
                };
                db.Users.Add(user);
                db.Profiles.Add(new Profile { UserId = user.Id, Email = email, DisplayName = "Super Admin" });
                db.UserRoles.Add(new UserRole { UserId = user.Id, FamilyId = null, Role = AppRole.Superadmin });
                await db.SaveChangesAsync();
                log.LogInformation("Seeded global superadmin {Email}", email);
            }
        }
    }
}
