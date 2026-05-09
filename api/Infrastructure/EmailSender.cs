using MailKit.Net.Smtp;
using MimeKit;

namespace AssetHub.Api.Infrastructure;

public class SmtpOptions
{
    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 1025;
    public string From { get; set; } = "no-reply@assethub.local";
    public string? Username { get; set; }
    public string? Password { get; set; }
}

public interface IEmailSender
{
    Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default);
}

public class SmtpEmailSender : IEmailSender
{
    private readonly SmtpOptions _opts;
    private readonly ILogger<SmtpEmailSender> _log;

    public SmtpEmailSender(SmtpOptions opts, ILogger<SmtpEmailSender> log)
    {
        _opts = opts;
        _log = log;
    }

    public async Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
    {
        try
        {
            var msg = new MimeMessage();
            msg.From.Add(MailboxAddress.Parse(_opts.From));
            msg.To.Add(MailboxAddress.Parse(to));
            msg.Subject = subject;
            msg.Body = new BodyBuilder { HtmlBody = htmlBody }.ToMessageBody();

            using var smtp = new SmtpClient();
            await smtp.ConnectAsync(_opts.Host, _opts.Port, MailKit.Security.SecureSocketOptions.None, ct);
            if (!string.IsNullOrEmpty(_opts.Username))
                await smtp.AuthenticateAsync(_opts.Username, _opts.Password, ct);
            await smtp.SendAsync(msg, ct);
            await smtp.DisconnectAsync(true, ct);
        }
        catch (Exception ex)
        {
            // Don't fail the request because mail bounced — just log it.
            _log.LogWarning(ex, "Failed to send email to {To}", to);
        }
    }
}
