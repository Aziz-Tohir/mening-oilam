using System.Threading.Channels;

namespace MeningOilam.Infrastructure.Media;

/// <summary>In-process signal queue of pending <c>VideoDownloadJob</c> ids (singleton).
/// Durability comes from the DB rows; this channel just wakes the worker without polling.</summary>
public class VideoDownloadQueue
{
    private readonly Channel<Guid> _channel =
        Channel.CreateUnbounded<Guid>(new UnboundedChannelOptions { SingleReader = true });

    public ValueTask EnqueueAsync(Guid jobId, CancellationToken ct = default) =>
        _channel.Writer.WriteAsync(jobId, ct);

    public IAsyncEnumerable<Guid> ReadAllAsync(CancellationToken ct) =>
        _channel.Reader.ReadAllAsync(ct);
}
