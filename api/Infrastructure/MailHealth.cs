using System.Net.Sockets;

namespace AssetHub.Api.Infrastructure;

/// <summary>
/// Cheap "is the mail server reachable?" probe. We don't try to actually send a
/// message — opening a TCP connection is enough to tell us whether the SMTP port
/// is alive without leaving phantom messages in the queue. The result is cached
/// for a short window so the members page can call this every render without
/// hammering MailHog.
/// </summary>
public interface IMailHealth
{
    Task<MailHealthStatus> GetAsync(CancellationToken ct = default);
}

public record MailHealthStatus(bool Enabled, DateTimeOffset LastChecked, string? Reason);

public class MailHealth : IMailHealth
{
    // 60s is enough to absorb the burst of calls a members-page render produces,
    // but short enough that the UI recovers within a minute of SMTP coming back.
    static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(60);

    readonly SmtpOptions _smtp;
    readonly ResendOptions _resend;
    readonly ILogger<MailHealth> _log;
    readonly SemaphoreSlim _gate = new(1, 1);
    MailHealthStatus? _cached;

    public MailHealth(SmtpOptions smtp, ResendOptions resend, ILogger<MailHealth> log)
    {
        _smtp = smtp;
        _resend = resend;
        _log = log;
    }

    public async Task<MailHealthStatus> GetAsync(CancellationToken ct = default)
    {
        var snapshot = _cached;
        if (snapshot is not null && DateTimeOffset.UtcNow - snapshot.LastChecked < CacheTtl)
            return snapshot;

        // Single-flight: if multiple requests race to probe at once, only one
        // actually opens the socket; the others wait and reuse the result.
        await _gate.WaitAsync(ct);
        try
        {
            // Re-check inside the lock — another caller may have refreshed.
            if (_cached is not null && DateTimeOffset.UtcNow - _cached.LastChecked < CacheTtl)
                return _cached;

            _cached = await ProbeAsync(ct);
            return _cached;
        }
        finally
        {
            _gate.Release();
        }
    }

    async Task<MailHealthStatus> ProbeAsync(CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;

        // If Resend is configured it's the active transport — no SMTP probe needed.
        // We deliberately don't hit Resend's API here; doing so on every health-check
        // request would burn through API quota for no benefit. The startup
        // misconfiguration would show up as failed sends in the logs instead.
        if (_resend.IsConfigured)
            return new MailHealthStatus(true, now, "Resend");

        if (string.IsNullOrWhiteSpace(_smtp.Host) || _smtp.Port <= 0)
            return new MailHealthStatus(false, now, "SMTP host or port not configured.");

        try
        {
            using var probe = new CancellationTokenSource(TimeSpan.FromSeconds(2));
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, probe.Token);
            using var tcp = new TcpClient();
            await tcp.ConnectAsync(_smtp.Host, _smtp.Port, linked.Token);
            return new MailHealthStatus(true, now, null);
        }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "SMTP probe to {Host}:{Port} failed", _smtp.Host, _smtp.Port);
            return new MailHealthStatus(false, now, ex.GetType().Name);
        }
    }
}
