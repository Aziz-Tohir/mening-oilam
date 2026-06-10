using Cronos;
using MeningOilam.Infrastructure.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace MeningOilam.Infrastructure.Jobs;

/// <summary>Runs scheduled jobs on cron expressions (replaces pg_cron). Each tick runs in its own DI scope.</summary>
public class CronScheduler(
    IServiceScopeFactory scopeFactory,
    IOptions<CronOptions> options,
    ILogger<CronScheduler> log) : BackgroundService
{
    private readonly CronOptions _o = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_o.Enabled) { log.LogInformation("Cron scheduler disabled"); return; }

        var schedules = new (string Job, string Expr)[]
        {
            ("daily-reminders", _o.DailyReminders),
            ("process-join-requests", _o.ProcessJoinRequests),
            ("sentiment-analysis", _o.SentimentAnalysis),
            ("annual-awards", _o.AnnualAwards),
        }.Select(s => (s.Job, Cron: CronExpression.Parse(s.Expr, CronFormat.Standard), Next: (DateTime?)null)).ToArray();

        log.LogInformation("Cron scheduler started with {Count} jobs", schedules.Length);

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            var now = DateTime.UtcNow;
            for (var i = 0; i < schedules.Length; i++)
            {
                ref var s = ref schedules[i];
                s.Next ??= s.Cron.GetNextOccurrence(now);
                if (s.Next is { } next && now >= next)
                {
                    s.Next = s.Cron.GetNextOccurrence(now);
                    _ = RunJobAsync(s.Job, stoppingToken);
                }
            }
        }
    }

    private async Task RunJobAsync(string jobName, CancellationToken ct)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var runner = scope.ServiceProvider.GetRequiredService<JobRunner>();
            await runner.RunAsync(jobName, ct);
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Scheduled job {Job} failed", jobName);
        }
    }
}

/// <summary>Resolves and runs a job by name — used by the scheduler and the admin "run now" endpoint.</summary>
public class JobRunner(IEnumerable<IBackgroundJob> jobs, ILogger<JobRunner> log)
{
    public async Task<object> RunAsync(string name, CancellationToken ct)
    {
        var job = jobs.FirstOrDefault(j => j.Name == name) ?? throw new ArgumentException($"Unknown job: {name}");
        log.LogInformation("Running job {Job}", name);
        return await job.ExecuteAsync(ct);
    }

    public IEnumerable<string> JobNames => jobs.Select(j => j.Name);
}
