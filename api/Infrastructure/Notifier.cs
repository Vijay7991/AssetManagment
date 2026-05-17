using AssetHub.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Infrastructure;

public interface INotifier
{
    /// <summary>
    /// Stages an in-app notification for the given user. Email is best-effort:
    /// if a user has an email address, a copy is fired async. Call SaveChangesAsync
    /// on the DbContext to persist the in-app record.
    /// </summary>
    void Notify(Guid userId, string kind, string title, string? body, string? link = null);
}

public class Notifier : INotifier
{
    private readonly AppDbContext _db;
    private readonly ICurrentUser _user;
    private readonly IEmailSender _email;
    private readonly ILogger<Notifier> _log;

    public Notifier(AppDbContext db, ICurrentUser user, IEmailSender email, ILogger<Notifier> log)
    {
        _db = db;
        _user = user;
        _email = email;
        _log = log;
    }

    public void Notify(Guid userId, string kind, string title, string? body, string? link = null)
    {
        if (_user.TenantId is not Guid tid) return;
        var n = new Notification
        {
            TenantId = tid,
            UserId = userId,
            Kind = kind,
            Title = title,
            Body = body,
            Link = link,
        };
        _db.Notifications.Add(n);

        // Send email best-effort, fire-and-forget. Look up the user's email outside
        // the current SaveChanges so we don't block the audit/business write.
        _ = SendEmailAsync(userId, title, body, link);
    }

    async Task SendEmailAsync(Guid userId, string title, string? body, string? link)
    {
        try
        {
            var email = await _db.Users.AsNoTracking()
                .Where(u => u.Id == userId)
                .Select(u => u.Email)
                .FirstOrDefaultAsync();
            if (string.IsNullOrEmpty(email)) return;
            await _email.SendAsync(email, title, EmailTemplates.Notification(title, body, link));
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Failed to send notification email to {User}", userId);
        }
    }
}
