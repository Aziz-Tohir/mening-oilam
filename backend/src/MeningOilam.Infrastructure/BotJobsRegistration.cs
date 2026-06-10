using MeningOilam.Application.Abstractions;
using MeningOilam.Infrastructure.Bot;
using MeningOilam.Infrastructure.Jobs;
using MeningOilam.Infrastructure.Media;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace MeningOilam.Infrastructure;

public static class BotJobsRegistration
{
    public static IServiceCollection AddBotAndJobs(this IServiceCollection services, IConfiguration config)
    {
        // Bot pipeline
        services.AddScoped<BotSessionStore>();
        services.AddScoped<ModerationService>();
        services.AddScoped<BotUpdateProcessor>();

        // Scheduled jobs
        services.AddScoped<IBackgroundJob, DailyRemindersJob>();
        services.AddScoped<IBackgroundJob, ProcessJoinRequestsJob>();
        services.AddScoped<IBackgroundJob, SentimentAnalysisJob>();
        services.AddScoped<IBackgroundJob, AnnualAwardsJob>();
        services.AddScoped<JobRunner>();

        // Clean video relay (cobalt) pipeline
        services.AddHttpClient<IVideoDownloader, CobaltVideoDownloader>(c => c.Timeout = TimeSpan.FromSeconds(60));
        services.AddHttpClient("cobalt-media", c => c.Timeout = TimeSpan.FromMinutes(3));
        services.AddSingleton<VideoDownloadQueue>();

        // Hosted services
        services.AddHostedService<PollingService>();
        services.AddHostedService<CronScheduler>();
        services.AddHostedService<VideoDownloadWorker>();

        return services;
    }
}
