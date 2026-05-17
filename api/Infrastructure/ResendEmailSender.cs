using System.Net.Http.Headers;
using System.Text.Json;

namespace AssetHub.Api.Infrastructure;

public class ResendOptions
{
    /// API key issued by https://resend.com/api-keys. Format: "re_…".
    public string ApiKey { get; set; } = "";
    /// Verified sender — until you verify a domain on Resend, only
    /// "onboarding@resend.dev" works and replies stay in your dashboard.
    public string From { get; set; } = "onboarding@resend.dev";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey);
}

/// Sends transactional email via the Resend HTTP API. We pick this over
/// SMTP for prod because:
///   - no port 25/465/587 outbound traffic — works behind home routers and
///     Cloudflare Tunnel without firewall changes
///   - Resend handles DKIM/SPF for us once a domain is verified
///   - replies/bounces land in a single dashboard instead of being silently
///     dropped by the SMTP relay
public class ResendEmailSender : IEmailSender
{
    private readonly HttpClient _http;
    private readonly ResendOptions _opts;
    private readonly ILogger<ResendEmailSender> _log;

    public ResendEmailSender(HttpClient http, ResendOptions opts, ILogger<ResendEmailSender> log)
    {
        _http = http;
        _opts = opts;
        _log = log;
        _http.BaseAddress ??= new Uri("https://api.resend.com/");
        _http.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", _opts.ApiKey);
    }

    public async Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
    {
        try
        {
            // Resend's body shape: { from, to: string|string[], subject, html }
            // Single string `to` is accepted, so no array allocation needed.
            var payload = new
            {
                from = _opts.From,
                to,
                subject,
                html = htmlBody,
            };

            using var req = new HttpRequestMessage(HttpMethod.Post, "emails")
            {
                Content = JsonContent.Create(payload),
            };
            using var res = await _http.SendAsync(req, ct);

            if (!res.IsSuccessStatusCode)
            {
                var body = await res.Content.ReadAsStringAsync(ct);
                _log.LogWarning(
                    "Resend rejected mail to {To}: {Status} {Body}",
                    to, (int)res.StatusCode, body);
            }
        }
        catch (Exception ex)
        {
            // Mirror SmtpEmailSender: swallow failures, never break the request.
            // Callers don't await a confirmation that the email reached the inbox —
            // that's the user's MUA's problem, not ours.
            _log.LogWarning(ex, "Resend send failed for {To}", to);
        }
    }
}
