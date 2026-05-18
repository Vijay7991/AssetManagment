using AssetHub.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Infrastructure;

/// <summary>
/// Category keys used as the second check (after the global toggle) before
/// sending any transactional email. Default when no row exists is true —
/// all categories are on until an admin explicitly disables one.
/// </summary>
public static class MailCategory
{
    public const string Maintenance   = "maintenance";
    public const string Notifications = "notifications";
    public const string Warranty      = "warranty";
    public const string Assets        = "assets";
    public const string Invites       = "invites";

    public static readonly string[] All =
        [Maintenance, Notifications, Warranty, Assets, Invites];
}

public interface IMailSettings
{
    /// Returns true only when the root admin has explicitly enabled mail delivery.
    Task<bool> IsEnabledAsync(CancellationToken ct = default);

    /// Returns true when global mail is on AND the specific category is enabled.
    Task<bool> IsCategoryEnabledAsync(string category, CancellationToken ct = default);

    Task<MailSettingsDto> GetAsync(CancellationToken ct = default);
    Task SetGlobalAsync(bool enabled, Guid updatedBy, CancellationToken ct);
    Task SetCategoryAsync(string category, bool enabled, Guid updatedBy, CancellationToken ct);
}

public record MailSettingsDto(
    bool Enabled,
    DateTimeOffset? UpdatedAt,
    Guid? UpdatedByUserId,
    IReadOnlyDictionary<string, bool> Categories);

/// <summary>
/// Singleton service backed by SystemSetting rows.
/// Keys: "mail.enabled" (global), "mail.category.{name}" (per-category).
/// Cache TTL is 5 minutes; writes invalidate immediately.
/// </summary>
public class MailSettingsService : IMailSettings
{
    const string GlobalKey       = "mail.enabled";
    const string CategoryPrefix  = "mail.category.";
    static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

    readonly IServiceProvider _sp;
    readonly SemaphoreSlim    _gate = new(1, 1);
    MailSettingsDto?  _cache;
    DateTimeOffset    _cachedAt;

    public MailSettingsService(IServiceProvider sp) => _sp = sp;

    public async Task<bool> IsEnabledAsync(CancellationToken ct = default)
        => (await GetAsync(ct)).Enabled;

    public async Task<bool> IsCategoryEnabledAsync(string category, CancellationToken ct = default)
    {
        var s = await GetAsync(ct);
        if (!s.Enabled) return false;
        // Default true — if no row exists the category is considered on.
        return !s.Categories.TryGetValue(category, out var val) || val;
    }

    public async Task<MailSettingsDto> GetAsync(CancellationToken ct = default)
    {
        var snapshot = _cache;
        if (snapshot is not null && DateTimeOffset.UtcNow - _cachedAt < CacheTtl)
            return snapshot;

        await _gate.WaitAsync(ct);
        try
        {
            if (_cache is not null && DateTimeOffset.UtcNow - _cachedAt < CacheTtl)
                return _cache;

            using var scope = _sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var rows = await db.SystemSettings
                .AsNoTracking()
                .Where(s => s.Key == GlobalKey || s.Key.StartsWith(CategoryPrefix))
                .ToListAsync(ct);

            var globalRow = rows.FirstOrDefault(r => r.Key == GlobalKey);
            var categories = new Dictionary<string, bool>();
            foreach (var row in rows.Where(r => r.Key.StartsWith(CategoryPrefix)))
                categories[row.Key[CategoryPrefix.Length..]] = row.Value == "true";

            _cache = new MailSettingsDto(
                Enabled:           globalRow?.Value == "true",
                UpdatedAt:         globalRow?.UpdatedAt,
                UpdatedByUserId:   globalRow?.UpdatedByUserId,
                Categories:        categories);
            _cachedAt = DateTimeOffset.UtcNow;
            return _cache;
        }
        catch
        {
            return new MailSettingsDto(false, null, null, new Dictionary<string, bool>());
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task SetGlobalAsync(bool enabled, Guid updatedBy, CancellationToken ct)
    {
        await UpsertAsync(GlobalKey, enabled, updatedBy, ct);
        await InvalidateCacheAsync(ct);
    }

    public async Task SetCategoryAsync(string category, bool enabled, Guid updatedBy, CancellationToken ct)
    {
        if (!MailCategory.All.Contains(category))
            throw new ArgumentException($"Unknown mail category: {category}", nameof(category));

        await UpsertAsync($"{CategoryPrefix}{category}", enabled, updatedBy, ct);
        await InvalidateCacheAsync(ct);
    }

    async Task UpsertAsync(string key, bool enabled, Guid updatedBy, CancellationToken ct)
    {
        using var scope = _sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var row = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == key, ct);
        if (row is null)
        {
            db.SystemSettings.Add(new SystemSetting
            {
                Key             = key,
                Value           = enabled ? "true" : "false",
                UpdatedAt       = DateTimeOffset.UtcNow,
                UpdatedByUserId = updatedBy,
            });
        }
        else
        {
            row.Value           = enabled ? "true" : "false";
            row.UpdatedAt       = DateTimeOffset.UtcNow;
            row.UpdatedByUserId = updatedBy;
        }
        await db.SaveChangesAsync(ct);
    }

    async Task InvalidateCacheAsync(CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try   { _cache = null; }
        finally { _gate.Release(); }
    }
}
