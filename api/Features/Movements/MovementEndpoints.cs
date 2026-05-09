using AssetHub.Api.Domain;
using AssetHub.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Features.Movements;

public record MovementDto(
    Guid Id,
    string Kind,
    string? FromLocation,
    string? ToLocation,
    Guid? FromUserId,
    string? FromUserName,
    Guid? ToUserId,
    string? ToUserName,
    string? Notes,
    string? PerformedByName,
    DateTimeOffset PerformedAt);

public record CheckOutRequest(Guid? ToUserId, string? ToLocation, string? Notes);
public record CheckInRequest(string? Notes, string? ToLocation);
public record MoveRequest(string ToLocation, string? Notes);

public static class MovementEndpoints
{
    public static void MapMovementEndpoints(this IEndpointRouteBuilder app)
    {
        var grp = app.MapGroup("/api/assets/{assetId:guid}").RequireAuthorization().WithTags("Movements");
        grp.MapGet("/movements", List);
        grp.MapPost("/check-out", CheckOut);
        grp.MapPost("/check-in", CheckIn);
        grp.MapPost("/move", Move);
    }

    static async Task<Results<Ok<List<MovementDto>>, NotFound>> List(
        Guid assetId, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        var asset = await db.Assets.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assetId && a.TenantId == cu.TenantId, ct);
        if (asset is null) return TypedResults.NotFound();

        var users = await db.Users.AsNoTracking().ToDictionaryAsync(u => u.Id, u => u.DisplayName, ct);

        var movs = await db.AssetMovements
            .Where(m => m.AssetId == assetId && m.TenantId == cu.TenantId)
            .OrderByDescending(m => m.PerformedAt)
            .ToListAsync(ct);

        var dtos = movs.Select(m => new MovementDto(
            m.Id, m.Kind, m.FromLocation, m.ToLocation,
            m.FromUserId, m.FromUserId.HasValue && users.TryGetValue(m.FromUserId.Value, out var fn) ? fn : null,
            m.ToUserId, m.ToUserId.HasValue && users.TryGetValue(m.ToUserId.Value, out var tn) ? tn : null,
            m.Notes,
            users.TryGetValue(m.PerformedBy, out var pn) ? pn : null,
            m.PerformedAt
        )).ToList();
        return TypedResults.Ok(dtos);
    }

    static async Task<Results<Ok, NotFound, BadRequest<string>, ForbidHttpResult>> CheckOut(
        Guid assetId, CheckOutRequest req, ICurrentUser cu, AppDbContext db,
        IAuditLogger audit, INotifier notifier, CancellationToken ct)
    {
        if (!cu.HasRole("Admin", "Manager", "Member")) return TypedResults.Forbid();
        var asset = await db.Assets.FirstOrDefaultAsync(a => a.Id == assetId && a.TenantId == cu.TenantId && a.DeletedAt == null, ct);
        if (asset is null) return TypedResults.NotFound();
        if (asset.AssignedToUserId.HasValue)
            return TypedResults.BadRequest("Asset is already checked out. Check it in first.");

        var toUserId = req.ToUserId ?? cu.UserId!.Value;
        // Verify the recipient is a member of this tenant
        if (!await db.Memberships.AnyAsync(m => m.TenantId == cu.TenantId && m.UserId == toUserId, ct))
            return TypedResults.BadRequest("Recipient is not a member of this workspace.");

        var fromLoc = asset.Location;
        asset.AssignedToUserId = toUserId;
        if (!string.IsNullOrWhiteSpace(req.ToLocation)) asset.Location = req.ToLocation;
        asset.UpdatedAt = DateTimeOffset.UtcNow;

        db.AssetMovements.Add(new AssetMovement
        {
            TenantId = cu.TenantId!.Value,
            AssetId = assetId,
            Kind = "CheckOut",
            FromLocation = fromLoc,
            ToLocation = asset.Location,
            ToUserId = toUserId,
            Notes = req.Notes,
            PerformedBy = cu.UserId!.Value,
        });
        audit.Log("CheckedOut", "Asset", assetId, $"Checked out '{asset.Name}'", new { toUserId, asset.Location });

        if (toUserId != cu.UserId)
        {
            notifier.Notify(toUserId, "AssetAssigned",
                $"Asset checked out to you: {asset.Name}",
                $"Location: {asset.Location ?? "—"}",
                $"/assets/{assetId}");
        }

        await db.SaveChangesAsync(ct);
        return TypedResults.Ok();
    }

    static async Task<Results<Ok, NotFound, BadRequest<string>, ForbidHttpResult>> CheckIn(
        Guid assetId, CheckInRequest req, ICurrentUser cu, AppDbContext db,
        IAuditLogger audit, CancellationToken ct)
    {
        if (!cu.HasRole("Admin", "Manager", "Member")) return TypedResults.Forbid();
        var asset = await db.Assets.FirstOrDefaultAsync(a => a.Id == assetId && a.TenantId == cu.TenantId && a.DeletedAt == null, ct);
        if (asset is null) return TypedResults.NotFound();
        if (!asset.AssignedToUserId.HasValue)
            return TypedResults.BadRequest("Asset is not currently checked out.");

        var fromUserId = asset.AssignedToUserId;
        var fromLoc = asset.Location;
        asset.AssignedToUserId = null;
        if (!string.IsNullOrWhiteSpace(req.ToLocation)) asset.Location = req.ToLocation;
        asset.UpdatedAt = DateTimeOffset.UtcNow;

        db.AssetMovements.Add(new AssetMovement
        {
            TenantId = cu.TenantId!.Value,
            AssetId = assetId,
            Kind = "CheckIn",
            FromUserId = fromUserId,
            FromLocation = fromLoc,
            ToLocation = asset.Location,
            Notes = req.Notes,
            PerformedBy = cu.UserId!.Value,
        });
        audit.Log("CheckedIn", "Asset", assetId, $"Checked in '{asset.Name}'");

        await db.SaveChangesAsync(ct);
        return TypedResults.Ok();
    }

    static async Task<Results<Ok, NotFound, BadRequest<string>, ForbidHttpResult>> Move(
        Guid assetId, MoveRequest req, ICurrentUser cu, AppDbContext db,
        IAuditLogger audit, CancellationToken ct)
    {
        if (!cu.HasRole("Admin", "Manager", "Member")) return TypedResults.Forbid();
        if (string.IsNullOrWhiteSpace(req.ToLocation)) return TypedResults.BadRequest("Destination location is required.");
        var asset = await db.Assets.FirstOrDefaultAsync(a => a.Id == assetId && a.TenantId == cu.TenantId && a.DeletedAt == null, ct);
        if (asset is null) return TypedResults.NotFound();

        var from = asset.Location;
        asset.Location = req.ToLocation;
        asset.UpdatedAt = DateTimeOffset.UtcNow;

        db.AssetMovements.Add(new AssetMovement
        {
            TenantId = cu.TenantId!.Value,
            AssetId = assetId,
            Kind = "Move",
            FromLocation = from,
            ToLocation = req.ToLocation,
            Notes = req.Notes,
            PerformedBy = cu.UserId!.Value,
        });
        audit.Log("Moved", "Asset", assetId, $"Moved '{asset.Name}' from {from ?? "—"} to {req.ToLocation}");

        await db.SaveChangesAsync(ct);
        return TypedResults.Ok();
    }
}
