using AssetHub.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Infrastructure;

/// <summary>
/// Periodically scans every tenant for assets whose warranty is about to expire
/// and creates one notification per (asset, threshold) for tenant admins/managers.
/// Dedupes so we don't spam — same kind+link won't fire twice within the window.
/// Sends a bundled summary email to each recipient with all their expiring items.
/// </summary>
public class WarrantyNotificationService : BackgroundService
{
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
        var db     = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var mailer = scope.ServiceProvider.GetRequiredService<IEmailSender>();

        var today   = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var maxDate = today.AddDays(ThresholdDays.Max());

        var expiring = await db.Assets
            .Include(a => a.AssetType)
            .Where(a => a.DeletedAt == null
                && a.WarrantyUntil != null
                && a.WarrantyUntil >= today
                && a.WarrantyUntil <= maxDate)
            .ToListAsync(ct);

        if (expiring.Count == 0) return;

        // Track which (userId → list of expiry items) to email at end of scan
        var emailQueue = new Dictionary<Guid, List<(string AssetName, string TypeName, string ExpiresOn, int DaysLeft)>>();
        var emailAddresses = new Dictionary<Guid, (string Email, string DisplayName)>();

        foreach (var byTenant in expiring.GroupBy(a => a.TenantId))
        {
            var tenantId = byTenant.Key;
            var recipients = await db.Memberships
                .Include(m => m.User)
                .Where(m => m.TenantId == tenantId &&
                            (m.Role == "Admin" || m.Role == "Manager"))
                .ToListAsync(ct);
            if (recipients.Count == 0) continue;

            foreach (var asset in byTenant)
            {
                var daysLeft = asset.WarrantyUntil!.Value.DayNumber - today.DayNumber;
                var thresholdHit = ThresholdDays
                    .OrderBy(d => d)
                    .FirstOrDefault(d => daysLeft <= d);
                if (thresholdHit == 0) continue;

                var link = $"/assets/{asset.Id}";
                var kind = $"WarrantyExpiring:{thresholdHit}";

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

                foreach (var membership in recipients.Where(m => !alreadyNotified.Contains(m.UserId)))
                {
                    db.Notifications.Add(new Notification
                    {
                        TenantId = tenantId,
                        UserId = membership.UserId,
                        Kind = kind,
                        Title = title,
                        Body = body,
                        Link = link,
                    });

                    // Collect for summary email
                    if (!emailQueue.ContainsKey(membership.UserId))
                    {
                        emailQueue[membership.UserId] = new();
                        if (!string.IsNullOrEmpty(membership.User.Email))
                            emailAddresses[membership.UserId] = (membership.User.Email, membership.User.DisplayName);
                    }
                    emailQueue[membership.UserId].Add((
                        asset.Name,
                        asset.AssetType.Name,
                        asset.WarrantyUntil!.Value.ToString("yyyy-MM-dd"),
                        daysLeft));
                }
            }
        }

        var written = await db.SaveChangesAsync(ct);
        if (written > 0)
            _log.LogInformation("Warranty scan: wrote {count} notification(s)", written);

        // Send one bundled summary email per recipient
        foreach (var (userId, items) in emailQueue)
        {
            if (!emailAddresses.TryGetValue(userId, out var addr)) continue;
            try
            {
                await mailer.SendAsync(
                    addr.Email,
                    $"Warranty expiry notice — {items.Count} asset{(items.Count == 1 ? "" : "s")} need attention",
                    EmailTemplates.WarrantyExpiry(addr.DisplayName, items),
                    ct);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Failed to send warranty email to {User}", userId);
            }
        }
    }
}
