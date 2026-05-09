using AssetHub.Api.Domain;
using System.Text.Json;

namespace AssetHub.Api.Infrastructure;

public interface IAuditLogger
{
    /// <summary>
    /// Records an audit event in the current tenant. Stages a record on the DbContext
    /// — call SaveChangesAsync to persist (typically the same SaveChanges as the
    /// business write you're auditing, so they're transactional together).
    /// </summary>
    void Log(string verb, string entityType, Guid? entityId, string summary, object? payload = null);
}

public class AuditLogger : IAuditLogger
{
    private readonly AppDbContext _db;
    private readonly ICurrentUser _user;

    public AuditLogger(AppDbContext db, ICurrentUser user)
    {
        _db = db;
        _user = user;
    }

    public void Log(string verb, string entityType, Guid? entityId, string summary, object? payload = null)
    {
        if (_user.TenantId is not Guid tid) return;
        var ev = new AuditEvent
        {
            TenantId = tid,
            ActorUserId = _user.UserId,
            ActorEmail = _user.Email,
            Verb = verb,
            EntityType = entityType,
            EntityId = entityId,
            Summary = summary,
            Payload = payload is null ? null : JsonDocument.Parse(JsonSerializer.Serialize(payload)),
        };
        _db.AuditEvents.Add(ev);
    }
}
