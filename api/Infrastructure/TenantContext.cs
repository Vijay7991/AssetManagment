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
    bool IsOwner { get; }
    IReadOnlyCollection<string> Permissions { get; }
    bool HasRole(params string[] roles);
    bool Can(string permission);
}

public class CurrentUser : ICurrentUser
{
    public CurrentUser(IHttpContextAccessor accessor)
    {
        var u = accessor.HttpContext?.User;
        if (u?.Identity?.IsAuthenticated != true) return;

        IsAuthenticated = true;

        // User id — accept long URL form OR short JWT names
        var userIdRaw = u.FindFirstValue(ClaimTypes.NameIdentifier)
                        ?? u.FindFirstValue("sub")
                        ?? u.FindFirstValue("nameid");
        if (Guid.TryParse(userIdRaw, out var uid)) UserId = uid;

        // Tenant id — accept several aliases
        var tidRaw = u.FindFirstValue("tenant_id")
                     ?? u.FindFirstValue("tid")
                     ?? u.FindFirstValue("tenantId")
                     ?? u.FindFirstValue("https://assethub.local/tenant_id");
        if (Guid.TryParse(tidRaw, out var tid)) TenantId = tid;

        Role = u.FindFirstValue(ClaimTypes.Role) ?? u.FindFirstValue("role");
        Email = u.FindFirstValue(ClaimTypes.Email) ?? u.FindFirstValue("email");
        IsOwner = string.Equals(u.FindFirstValue("owner"), "true", StringComparison.OrdinalIgnoreCase);

        // Permissions — encoded as a comma-separated list in the "perms" claim
        var permsRaw = u.FindFirstValue("perms");
        Permissions = string.IsNullOrEmpty(permsRaw)
            ? Array.Empty<string>()
            : permsRaw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    public Guid? UserId { get; }
    public Guid? TenantId { get; }
    public string? Role { get; }
    public string? Email { get; }
    public bool IsAuthenticated { get; }
    public bool IsOwner { get; }
    public IReadOnlyCollection<string> Permissions { get; } = Array.Empty<string>();

    public bool HasRole(params string[] roles)
        => Role is not null && roles.Contains(Role, StringComparer.OrdinalIgnoreCase);

    public bool Can(string permission)
        => Permissions.Contains(permission, StringComparer.OrdinalIgnoreCase);
}
