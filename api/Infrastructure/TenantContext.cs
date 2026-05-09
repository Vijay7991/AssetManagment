using System.Security.Claims;

namespace AssetHub.Api.Infrastructure;

/// <summary>
/// Resolves the current user and active tenant from the JWT on every request.
/// Inject ICurrentUser into endpoints/services.
/// </summary>
public interface ICurrentUser
{
    Guid? UserId { get; }
    Guid? TenantId { get; }
    string? Role { get; }
    string? Email { get; }
    bool IsAuthenticated { get; }
    bool HasRole(params string[] roles);
}

public class CurrentUser : ICurrentUser
{
    public CurrentUser(IHttpContextAccessor accessor)
    {
        var u = accessor.HttpContext?.User;
        if (u?.Identity?.IsAuthenticated != true) return;

        IsAuthenticated = true;
        if (Guid.TryParse(u.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
            UserId = uid;
        if (Guid.TryParse(u.FindFirstValue("tid"), out var tid))
            TenantId = tid;
        Role = u.FindFirstValue(ClaimTypes.Role);
        Email = u.FindFirstValue(ClaimTypes.Email);
    }

    public Guid? UserId { get; }
    public Guid? TenantId { get; }
    public string? Role { get; }
    public string? Email { get; }
    public bool IsAuthenticated { get; }
    public bool HasRole(params string[] roles)
        => Role is not null && roles.Contains(Role, StringComparer.OrdinalIgnoreCase);
}
