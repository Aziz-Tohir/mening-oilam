using MeningOilam.Application.Abstractions;
using MeningOilam.Infrastructure.Configuration;
using Microsoft.Extensions.Options;

namespace MeningOilam.Infrastructure.Storage;

public class LocalFileStorage(IOptions<StorageOptions> options) : IFileStorage
{
    private readonly StorageOptions _o = options.Value;

    public async Task<string> SaveAsync(string keyPrefix, string fileName, Stream content, string contentType, CancellationToken ct = default)
    {
        var ext = Path.GetExtension(fileName);
        if (string.IsNullOrEmpty(ext)) ext = contentType.Contains("png") ? ".png" : ".jpg";
        var safePrefix = string.Concat(keyPrefix.Split(Path.GetInvalidFileNameChars()));
        var name = $"{Guid.NewGuid():N}{ext}";
        var dir = Path.Combine(_o.LocalPath, safePrefix);
        Directory.CreateDirectory(dir);
        var full = Path.Combine(dir, name);
        await using (var fs = File.Create(full))
            await content.CopyToAsync(fs, ct);
        return $"{_o.PublicBaseUrl.TrimEnd('/')}/{safePrefix}/{name}";
    }

    public Task DeleteAsync(string url, CancellationToken ct = default)
    {
        try
        {
            var rel = url.Replace(_o.PublicBaseUrl, "").TrimStart('/');
            var full = Path.Combine(_o.LocalPath, rel);
            if (File.Exists(full)) File.Delete(full);
        }
        catch { /* best-effort */ }
        return Task.CompletedTask;
    }
}
