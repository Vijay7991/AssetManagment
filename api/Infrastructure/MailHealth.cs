namespace AssetHub.Api.Infrastructure;

public interface IMailHealth
{
    Task<MailHealthStatus> GetAsync(CancellationToken ct = default);
}

public record MailHealthStatus(bool Enabled, DateTimeOffset LastChecked, string? Reason);

/// <summary>
/// Reports whether Resend is configured and ready to deliver email.
/// Resend is a managed cloud service, so "healthy" simply means the
/// API key is present in configuration. The result is cached for 60 s
/// so the members page can call this on every render without overhead.
/// </summary>
public class MailHealth : IMailHealth
{
    static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(60);

    readonly ResendOptions _opts;
    MailHealthStatus? _cached;

    public MailHealth(ResendOptions opts)
    {
        _opts = opts;
    }

    public Task<MailHealthStatus> GetAsync(CancellationToken ct = default)
    {
        var snapshot = _cached;
        if (snapshot is not null && DateTimeOffset.UtcNow - snapshot.LastChecked < CacheTtl)
            return Task.FromResult(snapshot);

        var now = DateTimeOffset.UtcNow;
        _cached = string.IsNullOrWhiteSpace(_opts.ApiKey)
            ? new MailHealthStatus(false, now, "RESEND_API_KEY is not configured.")
            : new MailHealthStatus(true, now, null);

        return Task.FromResult(_cached);
    }
}
