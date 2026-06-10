using System.IO.Compression;
using System.Threading.RateLimiting;
using MeningOilam.Api.Common;
using MeningOilam.Api.Endpoints;
using MeningOilam.Application.Abstractions;
using MeningOilam.Infrastructure;
using MeningOilam.Infrastructure.Auth;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.ResponseCompression;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddInfrastructure(builder.Configuration);

// snake_case JSON (property names + enum labels) → matches the old Supabase shape so the
// existing React pages keep working with minimal changes.
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower;
    o.SerializerOptions.PropertyNameCaseInsensitive = true;
    o.SerializerOptions.Converters.Add(
        new System.Text.Json.Serialization.JsonStringEnumConverter(
            System.Text.Json.JsonNamingPolicy.SnakeCaseLower));
});

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddExceptionHandler<AppExceptionHandler>();
builder.Services.AddProblemDetails();

// JWT auth
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        var jwt = new JwtTokenService(Microsoft.Extensions.Options.Options.Create(
            builder.Configuration.GetSection("Jwt").Get<MeningOilam.Infrastructure.Configuration.JwtOptions>()
            ?? new MeningOilam.Infrastructure.Configuration.JwtOptions()));
        options.TokenValidationParameters = jwt.ValidationParameters();
    });
builder.Services.AddAuthorization();

// CORS
var origins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

// Performance: response compression
builder.Services.Configure<BrotliCompressionProviderOptions>(o => o.Level = CompressionLevel.Fastest);
builder.Services.AddResponseCompression(o =>
{
    o.EnableForHttps = true;
    o.Providers.Add<BrotliCompressionProvider>();
    o.Providers.Add<GzipCompressionProvider>();
});

// Output caching
builder.Services.AddOutputCache(o => o.AddBasePolicy(b => b.Expire(TimeSpan.FromSeconds(10))));

// Rate limiting (global; sensitive endpoints can tighten separately)
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 300, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

builder.Services.AddOpenApi();

// Bot update pipeline + scheduled jobs
builder.Services.AddBotAndJobs(builder.Configuration);

var app = builder.Build();

// Apply migrations + seed superadmin on startup
await app.Services.InitializeDatabaseAsync(app.Configuration);

app.UseExceptionHandler();
app.UseResponseCompression();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseStaticFiles(); // serves wwwroot/uploads
app.UseCors();
app.UseRateLimiter();
app.UseOutputCache();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok", time = DateTimeOffset.UtcNow }));

// Feature endpoint groups
app.MapAuthEndpoints();
app.MapFamilyEndpoints();
app.MapMemberEndpoints();
app.MapRelationshipEndpoints();
app.MapEventEndpoints();
app.MapKinshipEndpoints();
app.MapStatsEndpoints();
app.MapAwardsEndpoints();
app.MapBotEndpoints();
app.MapSettingsEndpoints();
app.MapLogEndpoints();
app.MapAdminEndpoints();
app.MapBotControlEndpoints();
app.MapFileEndpoints();
app.MapProfileEndpoints();
app.MapPublicTelegramEndpoints();

app.Run();

public partial class Program;
