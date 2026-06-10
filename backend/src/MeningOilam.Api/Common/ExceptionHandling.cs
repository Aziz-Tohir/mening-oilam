using MeningOilam.Application.Abstractions;
using Microsoft.AspNetCore.Diagnostics;

namespace MeningOilam.Api.Common;

public class AppExceptionHandler(ILogger<AppExceptionHandler> log) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext ctx, Exception ex, CancellationToken ct)
    {
        var (status, title) = ex switch
        {
            ForbiddenException => (StatusCodes.Status403Forbidden, ex.Message),
            NotFoundException => (StatusCodes.Status404NotFound, ex.Message),
            ValidationException => (StatusCodes.Status400BadRequest, ex.Message),
            _ => (StatusCodes.Status500InternalServerError, "Server xatosi"),
        };

        if (status == StatusCodes.Status500InternalServerError)
            log.LogError(ex, "Unhandled exception");

        ctx.Response.StatusCode = status;
        await ctx.Response.WriteAsJsonAsync(new { error = title }, ct);
        return true;
    }
}
