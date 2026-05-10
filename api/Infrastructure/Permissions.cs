using AssetHub.Api.Domain;
using System.Text.Json;

namespace AssetHub.Api.Infrastructure;

/// <summary>
/// Canonical permission strings used across the API. Keep this list short.
/// New permissions should follow the "domain:verb" convention.
/// </summary>
public static class Perms
{
    public const string AssetsWrite     = "assets:write";       // create / edit / delete asset
    public const string AssetsCheckout  = "assets:checkout";    // check-in/out, move
    public const string CatalogWrite    = "catalog:write";      // categories + types + locations
    public const string MaintenanceWrite = "maintenance:write"; // tickets
    public const string ImportWrite     = "import:write";       // csv import
    public const string MembersWrite    = "members:write";      // invite, change role, remove

    /// All permissions an Admin holds by default.
    public static readonly string[] AdminDefaults = new[]
    {
        AssetsWrite, AssetsCheckout, CatalogWrite, MaintenanceWrite, ImportWrite, MembersWrite,
    };

    /// All permissions a Manager holds by default. No member management.
    public static readonly string[] ManagerDefaults = new[]
    {
        AssetsWrite, AssetsCheckout, CatalogWrite, MaintenanceWrite, ImportWrite,
    };

    /// Members get read access by default. Check-out is a separate explicit grant.
    public static readonly string[] MemberDefaults = Array.Empty<string>();

    /// Returns the full effective permission set for a membership: role defaults plus any extras.
    public static string[] Effective(TenantMembership m)
    {
        var defaults = m.Role switch
        {
            "Admin"   => AdminDefaults,
            "Manager" => ManagerDefaults,
            _         => MemberDefaults,
        };
        var extras = ParseExtras(m.ExtraPermissions);
        return defaults.Concat(extras).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
    }

    public static string[] ParseExtras(JsonDocument? doc)
    {
        if (doc is null) return Array.Empty<string>();
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Array) return Array.Empty<string>();
        return root.EnumerateArray()
            .Where(e => e.ValueKind == JsonValueKind.String)
            .Select(e => e.GetString()!)
            .ToArray();
    }

    public static JsonDocument? SerializeExtras(IEnumerable<string>? extras)
    {
        if (extras is null) return null;
        var arr = extras
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s.Trim().ToLowerInvariant())
            .Where(IsKnownPermission)
            .Distinct()
            .ToArray();
        return JsonDocument.Parse(JsonSerializer.Serialize(arr));
    }

    public static readonly HashSet<string> AllKnown = new(StringComparer.OrdinalIgnoreCase)
    {
        AssetsWrite, AssetsCheckout, CatalogWrite, MaintenanceWrite, ImportWrite, MembersWrite,
    };

    public static bool IsKnownPermission(string p) => AllKnown.Contains(p);
}
