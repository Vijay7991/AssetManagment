using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace AssetHub.Api.Infrastructure;

public class ResendOptions
{
    public string ApiKey { get; set; } = "";
    /// Full "From" header, e.g. "AssetHub <no-reply@mail.assethub.uk>"
    public string From { get; set; } = "AssetHub <no-reply@mail.assethub.uk>";
}

public interface IEmailSender
{
    Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default);
}

public class ResendEmailSender : IEmailSender
{
    readonly ResendOptions _opts;
    readonly IHttpClientFactory _http;
    readonly IMailSettings _mailSettings;
    readonly ILogger<ResendEmailSender> _log;

    public ResendEmailSender(
        ResendOptions opts,
        IHttpClientFactory http,
        IMailSettings mailSettings,
        ILogger<ResendEmailSender> log)
    {
        _opts = opts;
        _http = http;
        _mailSettings = mailSettings;
        _log = log;
    }

    public async Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_opts.ApiKey))
        {
            _log.LogWarning("RESEND_API_KEY is not configured — skipping email to {To}", to);
            return;
        }

        if (!await _mailSettings.IsEnabledAsync(ct))
        {
            _log.LogDebug("Email delivery is disabled by admin — skipping email to {To}", to);
            return;
        }

        try
        {
            using var client = _http.CreateClient("resend");
            var payload = JsonSerializer.Serialize(new
            {
                from    = _opts.From,
                to      = new[] { to },
                subject = subject,
                html    = htmlBody,
            });
            using var content = new StringContent(payload, Encoding.UTF8, "application/json");
            var response = await client.PostAsync("emails", content, ct);

            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(ct);
                _log.LogWarning("Resend returned {Status} for {To}: {Body}", (int)response.StatusCode, to, body);
            }
        }
        catch (Exception ex)
        {
            // Best-effort — never fail the calling request because mail bounced.
            _log.LogWarning(ex, "Failed to send email to {To}", to);
        }
    }
}
