using System.Security.Claims;
using MeningOilam.Application.Abstractions;

namespace MeningOilam.Api.Common;

public class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public Guid? UserId
    {
        get
        {
            var sub = accessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier)
                      ?? accessor.HttpContext?.User.FindFirstValue("sub");
            return Guid.TryParse(sub, out var id) ? id : null;
        }
    }

    public bool IsAuthenticated => UserId is not null;
}

public static class CurrentUserExtensions
{
    public static Guid RequireUserId(this ICurrentUser user) =>
        user.UserId ?? throw new ForbiddenException("Avtorizatsiya talab qilinadi");
}
