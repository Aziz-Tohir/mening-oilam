using MeningOilam.Api.Common;
using MeningOilam.Application.Abstractions;
using MeningOilam.Infrastructure.Data;
using MeningOilam.Infrastructure.Telegram;
using Microsoft.EntityFrameworkCore;

namespace MeningOilam.Api.Endpoints;

public record UpdateProfileRequest(string? FullName, string? Bio, string? PhotoUrl, DateOnly? BirthDate, string? Phone);

public static class FileEndpoints
{
    public static void MapFileEndpoints(this IEndpointRouteBuilder app)
    {
        // Avatar upload (multipart). Returns a public URL the frontend stores on the member/profile.
        app.MapPost("/api/files/avatar", async (HttpRequest request, ICurrentUser cu, IFileStorage storage, CancellationToken ct) =>
        {
            var userId = cu.RequireUserId();
            if (!request.HasFormContentType) throw new ValidationException("multipart/form-data kerak");
            var form = await request.ReadFormAsync(ct);
            var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
            if (file is null || file.Length == 0) throw new ValidationException("Fayl yo'q");
            if (file.Length > 8 * 1024 * 1024) throw new ValidationException("Fayl 8MB dan katta");
            await using var s = file.OpenReadStream();
            var url = await storage.SaveAsync($"avatars/{userId}", file.FileName, s, file.ContentType, ct);
            return Results.Ok(new { url });
        }).RequireAuthorization().DisableAntiforgery();
    }
}

public static class ProfileEndpoints
{
    public static void MapProfileEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/profile").RequireAuthorization();

        g.MapGet("/memberships", async (ICurrentUser cu, AppDbContext db, CancellationToken ct) =>
        {
            var userId = cu.RequireUserId();
            var memberships = await db.FamilyMembers.AsNoTracking().Where(m => m.UserId == userId)
                .Join(db.Families, m => m.FamilyId, f => f.Id, (m, f) => new
                {
                    member_id = m.Id, m.FamilyId, family_name = f.Name, m.FullName, m.Bio, m.PhotoUrl,
                    m.BirthDate, m.Phone, m.Gender, m.Status, m.SentimentOptOut,
                }).ToListAsync(ct);
            return Results.Ok(new { memberships });
        });

        g.MapPatch("/members/{memberId:guid}", async (Guid memberId, UpdateProfileRequest req, ICurrentUser cu, AppDbContext db, CancellationToken ct) =>
        {
            var userId = cu.RequireUserId();
            var m = await db.FamilyMembers.FirstOrDefaultAsync(x => x.Id == memberId && x.UserId == userId, ct)
                    ?? throw new ForbiddenException("Faqat o'z profilingiz");
            if (req.FullName is not null) m.FullName = req.FullName;
            if (req.Bio is not null) m.Bio = req.Bio;
            if (req.PhotoUrl is not null) m.PhotoUrl = req.PhotoUrl;
            if (req.BirthDate is not null) m.BirthDate = req.BirthDate;
            if (req.Phone is not null) m.Phone = req.Phone;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        });

        g.MapPost("/members/{memberId:guid}/import-telegram-photo", async (Guid memberId, ICurrentUser cu, AppDbContext db, TelegramClient tg, IFileStorage storage, CancellationToken ct) =>
        {
            var userId = cu.RequireUserId();
            var m = await db.FamilyMembers.FirstOrDefaultAsync(x => x.Id == memberId && x.UserId == userId, ct)
                    ?? throw new ForbiddenException("Faqat o'z profilingiz");
            var photos = await tg.CallAsync("getUserProfilePhotos", new { user_id = m.TelegramId, limit = 1 }, ct);
            if (photos is null || !photos.Value.TryGetProperty("photos", out var arr) || arr.GetArrayLength() == 0)
                throw new NotFoundException("Telegram rasmi topilmadi");
            var sizes = arr[0];
            var fileId = sizes[sizes.GetArrayLength() - 1].GetProperty("file_id").GetString()!;
            var bytes = await tg.DownloadFileAsync(fileId, ct) ?? throw new NotFoundException("Yuklab bo'lmadi");
            using var ms = new MemoryStream(bytes);
            var url = await storage.SaveAsync($"avatars/{userId}", "tg.jpg", ms, "image/jpeg", ct);
            m.PhotoUrl = url;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { photo_url = url });
        });
    }
}
