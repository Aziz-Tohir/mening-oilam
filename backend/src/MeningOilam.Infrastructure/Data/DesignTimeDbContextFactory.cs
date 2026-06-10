using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace MeningOilam.Infrastructure.Data;

/// <summary>Used by `dotnet ef migrations` at design time.</summary>
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var cs = Environment.GetEnvironmentVariable("CONNECTION_STRING")
                 ?? "Host=localhost;Port=5432;Database=mening_oilam;Username=postgres;Password=postgres";

        var dataSource = NpgsqlSetup.BuildDataSource(cs);
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(dataSource, o => o.MigrationsAssembly(typeof(AppDbContext).Assembly.FullName))
            .UseSnakeCaseNamingConvention()
            .Options;

        return new AppDbContext(options);
    }
}
