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

        // User id — accept long URL form OR short JWT names
        var userIdRaw = u.FindFirstValue(ClaimTypes.NameIdentifier)
                        ?? u.FindFirstValue("sub")
                        ?? u.FindFirstValue("nameid");
        if (Guid.TryParse(userIdRaw, out var uid)) UserId = uid;

        // Tenant id — JsonWebTokenHandler in newer .NET can normalize claim
        // names in surprising ways and "tid" overlaps with Azure-AD conventions,
        // so we accept several aliases.
        var tidRaw = u.FindFirstValue("tenant_id")
                     ?? u.FindFirstValue("tid")
                     ?? u.FindFirstValue("tenantId")
                     ?? u.FindFirstValue("https://assethub.local/tenant_id");
        if (Guid.TryParse(tidRaw, out var tid)) TenantId = tid;

        Role = u.FindFirstValue(ClaimTypes.Role) ?? u.FindFirstValue("role");
        Email = u.FindFirstValue(ClaimTypes.Email) ?? u.FindFirstValue("email");
    }

    public Guid? UserId { get; }
    public Guid? TenantId { get; }
    public string? Role { get; }
    public string? Email { get; }
    public bool IsAuthenticated { get; }
    public bool HasRole(params string[] roles)
        => Role is not null && roles.Contains(Role, StringComparer.OrdinalIgnoreCase);
}
