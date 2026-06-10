using MeningOilam.Application.Abstractions;
using MeningOilam.Infrastructure.Ai;
using MeningOilam.Infrastructure.Auth;
using MeningOilam.Infrastructure.Caching;
using MeningOilam.Infrastructure.Configuration;
using MeningOilam.Infrastructure.Data;
using MeningOilam.Infrastructure.Localization;
using MeningOilam.Infrastructure.Storage;
using MeningOilam.Infrastructure.Telegram;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace MeningOilam.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        services.Configure<JwtOptions>(config.GetSection(JwtOptions.Section));
        services.Configure<TelegramOptions>(config.GetSection(TelegramOptions.Section));
        services.Configure<AiOptions>(config.GetSection(AiOptions.Section));
        services.Configure<StorageOptions>(config.GetSection(StorageOptions.Section));
        services.Configure<CronOptions>(config.GetSection(CronOptions.Section));
        services.Configure<CobaltOptions>(config.GetSection(CobaltOptions.Section));

        var cs = config.GetConnectionString("Postgres")
                 ?? Environment.GetEnvironmentVariable("CONNECTION_STRING")
                 ?? "Host=localhost;Port=5432;Database=mening_oilam;Username=postgres;Password=postgres";

        // Shared, enum-mapped data source (singleton).
        var dataSource = NpgsqlSetup.BuildDataSource(cs);
        services.AddSingleton(dataSource);

        services.AddDbContextPool<AppDbContext>((sp, opt) =>
            opt.UseNpgsql(sp.GetRequiredService<NpgsqlDataSource>(),
                    o => o.MigrationsAssembly(typeof(AppDbContext).Assembly.FullName))
                .UseSnakeCaseNamingConvention());

#pragma warning disable EXTEXP0018 // HybridCache is experimental
        services.AddHybridCache();
#pragma warning restore EXTEXP0018

        // Auth
        services.AddSingleton<JwtTokenService>();
        services.AddScoped<AuthService>();
        services.AddScoped<IFamilyAuthorization, FamilyAuthorization>();

        // Telegram (typed HttpClient)
        services.AddHttpClient<TelegramClient>(c => c.Timeout = TimeSpan.FromSeconds(60));
        services.AddScoped<ITelegramService, TelegramService>();

        // Storage
        services.AddSingleton<IFileStorage, LocalFileStorage>();

        // Localization
        services.AddSingleton<ILocalizer, Localizer>();

        // AI sentiment — pluggable
        var ai = config.GetSection(AiOptions.Section).Get<AiOptions>() ?? new AiOptions();
        if (ai.Enabled)
            services.AddHttpClient<ISentimentAnalyzer, OpenAiSentimentAnalyzer>(c => c.Timeout = TimeSpan.FromSeconds(60));
        else
            services.AddSingleton<ISentimentAnalyzer, NullSentimentAnalyzer>();

        // Hot-path cache facade
        services.AddScoped<BotCache>();

        return services;
    }
}
