namespace AssetHub.Api.Infrastructure;

public interface IMailHealth
{
    Task<MailHealthStatus> GetAsync(CancellationToken ct = default);
}

public record MailHealthStatus(bool Enabled, DateTimeOffset LastChecked, string? Reason);

/// <summary>
/// Reports whether email delivery is fully operational:
///   1. RESEND_API_KEY must be configured.
///   2. The root admin must have enabled mail delivery (default: off).
/// Result is cached for 60 s; the admin-toggle portion updates instantly
/// because IMailSettings keeps its own cache and invalidates on write.
/// </summary>
public class MailHealth : IMailHealth
{
    static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(60);

    readonly ResendOptions _opts;
    readonly IMailSettings _mailSettings;
    MailHealthStatus? _cached;

    public MailHealth(ResendOptions opts, IMailSettings mailSettings)
    {
        _opts = opts;
        _mailSettings = mailSettings;
    }

    public async Task<MailHealthStatus> GetAsync(CancellationToken ct = default)
    {
        // Always re-check the admin toggle (IMailSettings has its own fast cache)
        // but skip the API-key check if our result is still fresh.
        var snapshot = _cached;
        var now = DateTimeOffset.UtcNow;

        if (string.IsNullOrWhiteSpace(_opts.ApiKey))
            return Cache(new MailHealthStatus(false, now, "RESEND_API_KEY is not configured."));

        if (!await _mailSettings.IsEnabledAsync(ct))
            return Cache(new MailHealthStatus(false, now, "Email delivery has been disabled by an administrator."));

        if (snapshot is not null && now - snapshot.LastChecked < CacheTtl)
            return snapshot;

        return Cache(new MailHealthStatus(true, now, null));
    }

    MailHealthStatus Cache(MailHealthStatus s) { _cached = s; return s; }
}
