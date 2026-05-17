using AssetHub.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Infrastructure;

public interface IMailSettings
{
    /// Returns true only when the root admin has explicitly enabled mail delivery.
    /// Default (no row in DB) is false.
    Task<bool> IsEnabledAsync(CancellationToken ct = default);

    Task<MailSettingsDto> GetAsync(CancellationToken ct = default);
    Task SetEnabledAsync(bool enabled, Guid updatedBy, CancellationToken ct);
}

public record MailSettingsDto(bool Enabled, DateTimeOffset? UpdatedAt, Guid? UpdatedByUserId);

/// <summary>
/// Singleton service backed by a SystemSetting row ("mail.enabled").
/// Caches the value for 5 minutes to avoid a DB hit on every outgoing email.
/// Cache is invalidated immediately after a write so changes are instantaneous.
/// </summary>
public class MailSettingsService : IMailSettings
{
    const string SettingKey = "mail.enabled";
    static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

    readonly IServiceProvider _sp;
    readonly SemaphoreSlim _gate = new(1, 1);
    MailSettingsDto? _cache;
    DateTimeOffset _cachedAt;

    public MailSettingsService(IServiceProvider sp) => _sp = sp;

    public async Task<bool> IsEnabledAsync(CancellationToken ct = default)
        => (await GetAsync(ct)).Enabled;

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
            var row = await db.SystemSettings
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.Key == SettingKey, ct);

            _cache = row is null
                ? new MailSettingsDto(false, null, null)
                : new MailSettingsDto(row.Value == "true", row.UpdatedAt, row.UpdatedByUserId);
            _cachedAt = DateTimeOffset.UtcNow;
            return _cache;
        }
        catch
        {
            // If DB is unavailable on startup, keep mail disabled rather than crash.
            return new MailSettingsDto(false, null, null);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task SetEnabledAsync(bool enabled, Guid updatedBy, CancellationToken ct)
    {
        using var scope = _sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var row = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == SettingKey, ct);
        if (row is null)
        {
            db.SystemSettings.Add(new SystemSetting
            {
                Key              = SettingKey,
                Value            = enabled ? "true" : "false",
                UpdatedAt        = DateTimeOffset.UtcNow,
                UpdatedByUserId  = updatedBy,
            });
        }
        else
        {
            row.Value           = enabled ? "true" : "false";
            row.UpdatedAt       = DateTimeOffset.UtcNow;
            row.UpdatedByUserId = updatedBy;
        }
        await db.SaveChangesAsync(ct);

        // Immediately propagate to cache so callers see the change without waiting for TTL
        await _gate.WaitAsync(ct);
        try
        {
            _cache     = new MailSettingsDto(enabled, DateTimeOffset.UtcNow, updatedBy);
            _cachedAt  = DateTimeOffset.UtcNow;
        }
        finally
        {
            _gate.Release();
        }
    }
}
