using AssetHub.Api.Domain;
using AssetHub.Api.Features.Assets;
using AssetHub.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace AssetHub.Api.Features.Audit;

public record AuditEventDto(
    Guid Id,
    string Verb,
    string EntityType,
    Guid? EntityId,
    string Summary,
    string? ActorEmail,
    DateTimeOffset At);

public static class AuditEndpoints
{
    public static void MapAuditEndpoints(this IEndpointRouteBuilder app)
    {
        var grp = app.MapGroup("/api/audit").RequireAuthorization().WithTags("Audit");
        grp.MapGet("/", List);
    }

    static async Task<Ok<PagedResult<AuditEventDto>>> List(
        ICurrentUser cu, AppDbContext db, CancellationToken ct,
        string? entityType = null,
        Guid? entityId = null,
        Guid? actorId = null,
        int page = 1,
        int pageSize = 50)
    {
        if (page < 1) page = 1;
        if (pageSize is < 1 or > 200) pageSize = 50;

        var q = db.AuditEvents.Where(a => a.TenantId == cu.TenantId);
        if (!string.IsNullOrEmpty(entityType)) q = q.Where(a => a.EntityType == entityType);
        if (entityId.HasValue) q = q.Where(a => a.EntityId == entityId.Value);
        if (actorId.HasValue) q = q.Where(a => a.ActorUserId == actorId.Value);

        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(a => a.At)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(a => new AuditEventDto(a.Id, a.Verb, a.EntityType, a.EntityId, a.Summary, a.ActorEmail, a.At))
            .ToListAsync(ct);

        return TypedResults.Ok(new PagedResult<AuditEventDto>(items, total, page, pageSize));
    }
}
