using AssetHub.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Infrastructure;

/// <summary>
/// Periodically scans every tenant for assets whose warranty is about to expire
/// and creates one notification per (asset, threshold) for tenant admins/managers.
/// Dedupes so we don't spam — same kind+link won't fire twice within the window.
/// </summary>
public class WarrantyNotificationService : BackgroundService
{
    // Notify when warranty crosses any of these thresholds
    static readonly int[] ThresholdDays = new[] { 30, 14, 7, 1 };

    static readonly TimeSpan ScanInterval = TimeSpan.FromHours(6);
    static readonly TimeSpan StartupDelay = TimeSpan.FromSeconds(15);

    readonly IServiceProvider _sp;
    readonly ILogger<WarrantyNotificationService> _log;

    public WarrantyNotificationService(IServiceProvider sp, ILogger<WarrantyNotificationService> log)
    {
        _sp = sp;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("Warranty notification service starting; first scan in {delay}", StartupDelay);
        try { await Task.Delay(StartupDelay, stoppingToken); } catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await ScanOnceAsync(stoppingToken); }
            catch (Exception ex) { _log.LogError(ex, "Warranty scan failed"); }

            try { await Task.Delay(ScanInterval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }

    public async Task ScanOnceAsync(CancellationToken ct)
    {
        using var scope = _sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var maxDate = today.AddDays(ThresholdDays.Max());

        // All assets whose warranty falls within the longest threshold window
        var expiring = await db.Assets
            .Include(a => a.AssetType)
            .Where(a => a.DeletedAt == null
                && a.WarrantyUntil != null
                && a.WarrantyUntil >= today
                && a.WarrantyUntil <= maxDate)
            .ToListAsync(ct);

        if (expiring.Count == 0) return;

        // Group by tenant so we look up admin/manager recipients once per tenant
        foreach (var byTenant in expiring.GroupBy(a => a.TenantId))
        {
            var tenantId = byTenant.Key;
            var recipients = await db.Memberships
                .Where(m => m.TenantId == tenantId &&
                            (m.Role == "Admin" || m.Role == "Manager"))
                .Select(m => m.UserId)
                .ToListAsync(ct);
            if (recipients.Count == 0) continue;

            foreach (var asset in byTenant)
            {
                var daysLeft = asset.WarrantyUntil!.Value.DayNumber - today.DayNumber;
                // Match the smallest threshold this asset has crossed
                var thresholdHit = ThresholdDays
                    .OrderBy(d => d)
                    .FirstOrDefault(d => daysLeft <= d);
                if (thresholdHit == 0) continue;

                var link = $"/assets/{asset.Id}";
                var kind = $"WarrantyExpiring:{thresholdHit}";

                // Skip if a notification of this exact kind+link was already
                // created for any of these recipients in the past 7 days.
                var since = DateTimeOffset.UtcNow.AddDays(-7);
                var alreadyNotified = await db.Notifications
                    .Where(n => n.TenantId == tenantId
                        && n.Kind == kind
                        && n.Link == link
                        && n.CreatedAt >= since)
                    .Select(n => n.UserId)
                    .ToListAsync(ct);

                var title = daysLeft <= 0
                    ? $"Warranty expired: {asset.Name}"
                    : daysLeft == 1
                        ? $"Warranty expires tomorrow: {asset.Name}"
                        : $"Warranty expires in {daysLeft} days: {asset.Name}";
                var body = $"{asset.AssetType.Name} · expires {asset.WarrantyUntil:yyyy-MM-dd}";

                foreach (var uid in recipients.Except(alreadyNotified))
                {
                    db.Notifications.Add(new Notification
                    {
                        TenantId = tenantId,
                        UserId = uid,
                        Kind = kind,
                        Title = title,
                        Body = body,
                        Link = link,
                    });
                }
            }
        }

        var written = await db.SaveChangesAsync(ct);
        if (written > 0)
            _log.LogInformation("Warranty scan: wrote {count} notification(s)", written);
    }
}
