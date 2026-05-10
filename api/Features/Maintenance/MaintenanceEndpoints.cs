using AssetHub.Api.Domain;
using AssetHub.Api.Features.Assets;
using AssetHub.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Features.Maintenance;

public record MaintenanceTicketDto(
    Guid Id,
    Guid AssetId,
    string AssetName,
    string Title,
    string? Description,
    string Kind,
    string Status,
    string Priority,
    Guid? AssignedToUserId,
    string? AssignedToName,
    DateTimeOffset? ScheduledFor,
    DateTimeOffset? CompletedAt,
    decimal? Cost,
    DateTimeOffset CreatedAt);

public record MaintenanceUpsertRequest(
    Guid AssetId,
    string Title,
    string? Description,
    string Kind,
    string Priority,
    Guid? AssignedToUserId,
    DateTimeOffset? ScheduledFor,
    decimal? Cost);

public record MaintenanceStatusUpdate(string Status, decimal? Cost, string? Notes);

public static class MaintenanceEndpoints
{
    public static void MapMaintenanceEndpoints(this IEndpointRouteBuilder app)
    {
        var grp = app.MapGroup("/api/maintenance").RequireAuthorization().WithTags("Maintenance");
        grp.MapGet("/", List);
        grp.MapGet("/{id:guid}", Get);
        grp.MapPost("/", Create);
        grp.MapPut("/{id:guid}", Update);
        grp.MapPost("/{id:guid}/status", UpdateStatus);
        grp.MapDelete("/{id:guid}", Delete);
        grp.MapGet("/by-asset/{assetId:guid}", ByAsset);
    }

    static async Task<Ok<PagedResult<MaintenanceTicketDto>>> List(
        ICurrentUser cu, AppDbContext db, CancellationToken ct,
        string? status = null, string? priority = null,
        Guid? assignedTo = null, int page = 1, int pageSize = 25)
    {
        if (page < 1) page = 1;
        if (pageSize is < 1 or > 200) pageSize = 25;

        var q = db.MaintenanceTickets.Where(t => t.TenantId == cu.TenantId);
        if (Enum.TryParse<MaintenanceStatus>(status, true, out var s)) q = q.Where(t => t.Status == s);
        if (Enum.TryParse<MaintenancePriority>(priority, true, out var p)) q = q.Where(t => t.Priority == p);
        if (assignedTo.HasValue) q = q.Where(t => t.AssignedToUserId == assignedTo.Value);

        var total = await q.CountAsync(ct);
        var items = await q
            .OrderByDescending(t => t.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(t => new MaintenanceTicketDto(
                t.Id, t.AssetId, t.Asset.Name, t.Title, t.Description,
                t.Kind.ToString(), t.Status.ToString(), t.Priority.ToString(),
                t.AssignedToUserId, t.AssignedToUser != null ? t.AssignedToUser.DisplayName : null,
                t.ScheduledFor, t.CompletedAt, t.Cost, t.CreatedAt))
            .ToListAsync(ct);

        return TypedResults.Ok(new PagedResult<MaintenanceTicketDto>(items, total, page, pageSize));
    }

    static async Task<Results<Ok<MaintenanceTicketDto>, NotFound>> Get(
        Guid id, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        var t = await db.MaintenanceTickets
            .Include(t => t.Asset).Include(t => t.AssignedToUser)
            .FirstOrDefaultAsync(t => t.Id == id && t.TenantId == cu.TenantId, ct);
        if (t is null) return TypedResults.NotFound();
        return TypedResults.Ok(MapDto(t));
    }

    static async Task<Ok<List<MaintenanceTicketDto>>> ByAsset(
        Guid assetId, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        var list = await db.MaintenanceTickets
            .Include(t => t.Asset).Include(t => t.AssignedToUser)
            .Where(t => t.AssetId == assetId && t.TenantId == cu.TenantId)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync(ct);
        return TypedResults.Ok(list.Select(MapDto).ToList());
    }

    static async Task<Results<Ok<MaintenanceTicketDto>, BadRequest<string>, ForbidHttpResult>> Create(
        MaintenanceUpsertRequest req, ICurrentUser cu, AppDbContext db,
        IAuditLogger audit, INotifier notifier, CancellationToken ct)
    {
        if (!cu.Can(Perms.MaintenanceWrite)) return TypedResults.Forbid();

        var asset = await db.Assets.FirstOrDefaultAsync(a =>
            a.Id == req.AssetId && a.TenantId == cu.TenantId && a.DeletedAt == null, ct);
        if (asset is null) return TypedResults.BadRequest("Asset not found.");

        var t = new MaintenanceTicket
        {
            TenantId = cu.TenantId!.Value,
            AssetId = req.AssetId,
            Title = req.Title.Trim(),
            Description = req.Description,
            Kind = Enum.TryParse<MaintenanceKind>(req.Kind, true, out var k) ? k : MaintenanceKind.Corrective,
            Priority = Enum.TryParse<MaintenancePriority>(req.Priority, true, out var p) ? p : MaintenancePriority.Medium,
            AssignedToUserId = req.AssignedToUserId,
            ScheduledFor = req.ScheduledFor,
            Cost = req.Cost,
            CreatedBy = cu.UserId!.Value,
        };
        db.MaintenanceTickets.Add(t);
        audit.Log("Created", "MaintenanceTicket", t.Id, $"Created ticket '{t.Title}' on '{asset.Name}'");

        if (req.AssignedToUserId.HasValue && req.AssignedToUserId != cu.UserId)
        {
            notifier.Notify(req.AssignedToUserId.Value,
                "MaintenanceAssigned",
                $"Maintenance assigned: {t.Title}",
                $"On asset '{asset.Name}'",
                $"/maintenance/{t.Id}");
        }

        await db.SaveChangesAsync(ct);
        var loaded = await db.MaintenanceTickets.Include(x => x.Asset).Include(x => x.AssignedToUser).FirstAsync(x => x.Id == t.Id, ct);
        return TypedResults.Ok(MapDto(loaded));
    }

    static async Task<Results<Ok<MaintenanceTicketDto>, NotFound, ForbidHttpResult>> Update(
        Guid id, MaintenanceUpsertRequest req, ICurrentUser cu, AppDbContext db,
        IAuditLogger audit, INotifier notifier, CancellationToken ct)
    {
        if (!cu.Can(Perms.MaintenanceWrite)) return TypedResults.Forbid();
        var t = await db.MaintenanceTickets.Include(x => x.Asset).Include(x => x.AssignedToUser)
            .FirstOrDefaultAsync(x => x.Id == id && x.TenantId == cu.TenantId, ct);
        if (t is null) return TypedResults.NotFound();

        var prevAssignee = t.AssignedToUserId;
        t.Title = req.Title.Trim();
        t.Description = req.Description;
        if (Enum.TryParse<MaintenanceKind>(req.Kind, true, out var k)) t.Kind = k;
        if (Enum.TryParse<MaintenancePriority>(req.Priority, true, out var p)) t.Priority = p;
        t.AssignedToUserId = req.AssignedToUserId;
        t.ScheduledFor = req.ScheduledFor;
        t.Cost = req.Cost;
        t.UpdatedAt = DateTimeOffset.UtcNow;

        audit.Log("Updated", "MaintenanceTicket", t.Id, $"Updated ticket '{t.Title}'");

        if (req.AssignedToUserId.HasValue && req.AssignedToUserId != prevAssignee && req.AssignedToUserId != cu.UserId)
        {
            notifier.Notify(req.AssignedToUserId.Value,
                "MaintenanceAssigned",
                $"Maintenance assigned: {t.Title}",
                $"On asset '{t.Asset.Name}'",
                $"/maintenance/{t.Id}");
        }

        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(MapDto(t));
    }

    static async Task<Results<Ok<MaintenanceTicketDto>, NotFound, ForbidHttpResult>> UpdateStatus(
        Guid id, MaintenanceStatusUpdate req, ICurrentUser cu, AppDbContext db,
        IAuditLogger audit, CancellationToken ct)
    {
        if (!cu.Can(Perms.MaintenanceWrite)) return TypedResults.Forbid();
        var t = await db.MaintenanceTickets.Include(x => x.Asset).Include(x => x.AssignedToUser)
            .FirstOrDefaultAsync(x => x.Id == id && x.TenantId == cu.TenantId, ct);
        if (t is null) return TypedResults.NotFound();

        if (!Enum.TryParse<MaintenanceStatus>(req.Status, true, out var status)) return TypedResults.NotFound();
        t.Status = status;
        if (status == MaintenanceStatus.Done) t.CompletedAt = DateTimeOffset.UtcNow;
        if (req.Cost.HasValue) t.Cost = req.Cost;
        t.UpdatedAt = DateTimeOffset.UtcNow;

        audit.Log("StatusChanged", "MaintenanceTicket", t.Id,
            $"Ticket '{t.Title}' → {status}", new { req.Notes });
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(MapDto(t));
    }

    static async Task<Results<NoContent, NotFound, ForbidHttpResult>> Delete(
        Guid id, ICurrentUser cu, AppDbContext db, IAuditLogger audit, CancellationToken ct)
    {
        if (!cu.Can(Perms.MaintenanceWrite)) return TypedResults.Forbid();
        var t = await db.MaintenanceTickets.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == cu.TenantId, ct);
        if (t is null) return TypedResults.NotFound();
        db.MaintenanceTickets.Remove(t);
        audit.Log("Deleted", "MaintenanceTicket", id, $"Deleted ticket '{t.Title}'");
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    static MaintenanceTicketDto MapDto(MaintenanceTicket t) => new(
        t.Id, t.AssetId, t.Asset.Name, t.Title, t.Description,
        t.Kind.ToString(), t.Status.ToString(), t.Priority.ToString(),
        t.AssignedToUserId, t.AssignedToUser?.DisplayName,
        t.ScheduledFor, t.CompletedAt, t.Cost, t.CreatedAt);
}
