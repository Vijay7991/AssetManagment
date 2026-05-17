using AssetHub.Api.Domain;
using AssetHub.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace AssetHub.Api.Features.Assets;

// ── DTOs ─────────────────────────────────────────────────────────────

public record UnitListItemDto(
    Guid Id,
    int UnitNumber,
    string? SerialNumber,
    string Status,
    Guid? LocationId,
    string? LocationName,
    string? LocationDetail,
    DateOnly? WarrantyUntil,
    Guid? AssignedToUserId,
    string? AssignedToName,
    string? PrimaryTagCode,
    DateTimeOffset CreatedAt);

public record UnitDetailDto(
    Guid Id,
    Guid AssetId,
    string AssetName,
    int UnitNumber,
    string? SerialNumber,
    string Status,
    Guid? LocationId,
    string? LocationName,
    string? LocationDetail,
    JsonElement? FieldValues,
    decimal? PurchasePrice,
    DateOnly? PurchasedOn,
    DateOnly? WarrantyUntil,
    Guid? AssignedToUserId,
    string? AssignedToName,
    IReadOnlyList<TagDto> Tags,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record UnitUpdateRequest(
    string? SerialNumber,
    string? Status,
    Guid? LocationId,
    string? LocationDetail,
    JsonElement? FieldValues,
    decimal? PurchasePrice,
    DateOnly? PurchasedOn,
    DateOnly? WarrantyUntil);

public record UnitCheckOutRequest(Guid? ToUserId, string? ToLocation, string? Notes);
public record UnitCheckInRequest(string? Notes, string? ToLocation);
public record BatchCheckOutRequest(IReadOnlyList<Guid> UnitIds, Guid? ToUserId, string? ToLocation, string? Notes);
public record BatchCheckInRequest(IReadOnlyList<Guid> UnitIds, string? Notes, string? ToLocation);

public static class AssetUnitEndpoints
{
    public static void MapAssetUnitEndpoints(this IEndpointRouteBuilder app)
    {
        var assetGrp = app.MapGroup("/api/assets/{assetId:guid}/units")
            .RequireAuthorization().WithTags("AssetUnits");

        assetGrp.MapGet("/", ListForAsset);
        assetGrp.MapPost("/", AddUnit);
        assetGrp.MapPost("/check-out-batch", BatchCheckOut);
        assetGrp.MapPost("/check-in-batch", BatchCheckIn);

        var unitGrp = app.MapGroup("/api/units")
            .RequireAuthorization().WithTags("AssetUnits");

        unitGrp.MapGet("/{unitId:guid}", Get);
        unitGrp.MapPut("/{unitId:guid}", Update);
        unitGrp.MapDelete("/{unitId:guid}", Delete);
        unitGrp.MapPost("/{unitId:guid}/check-out", CheckOut);
        unitGrp.MapPost("/{unitId:guid}/check-in", CheckIn);
    }

    // ── List / Add ───────────────────────────────────────────────────

    static async Task<Results<Ok<List<UnitListItemDto>>, NotFound>> ListForAsset(
        Guid assetId, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        // Ownership check — never leak existence across tenants.
        var assetExists = await db.Assets.AnyAsync(a =>
            a.Id == assetId && a.TenantId == cu.TenantId && a.DeletedAt == null, ct);
        if (!assetExists) return TypedResults.NotFound();

        var rows = await db.AssetUnits
            .Include(u => u.Location)
            .Include(u => u.AssignedToUser)
            .Include(u => u.Tags)
            .Where(u => u.AssetId == assetId && u.TenantId == cu.TenantId && u.DeletedAt == null)
            .OrderBy(u => u.UnitNumber)
            .ToListAsync(ct);

        var list = rows.Select(u => new UnitListItemDto(
            u.Id, u.UnitNumber, u.SerialNumber, u.Status.ToString(),
            u.LocationId, u.Location?.Name, u.LocationDetail,
            u.WarrantyUntil,
            u.AssignedToUserId, u.AssignedToUser?.DisplayName,
            u.Tags.Where(t => t.Status == AssetTagStatus.Active).Select(t => t.Code).FirstOrDefault(),
            u.CreatedAt
        )).ToList();
        return TypedResults.Ok(list);
    }

    static async Task<Results<Ok<UnitDetailDto>, NotFound, ForbidHttpResult, BadRequest<string>>> AddUnit(
        Guid assetId, UnitSeed? seed, ICurrentUser cu, AppDbContext db,
        HttpRequest http, IAuditLogger audit, CancellationToken ct)
    {
        if (!cu.Can(Perms.AssetsWrite)) return TypedResults.Forbid();

        var asset = await db.Assets
            .FirstOrDefaultAsync(a => a.Id == assetId && a.TenantId == cu.TenantId && a.DeletedAt == null, ct);
        if (asset is null) return TypedResults.NotFound();
        if (!asset.IsUnitTracked)
            return TypedResults.BadRequest("This asset isn't unit-tracked. Enable unit tracking before adding units.");

        // Sequential unit numbers — gaps from soft-deletes are fine, we just take
        // max+1. The serial number is the actual identity, this is for labels.
        var nextNumber = await db.AssetUnits
            .Where(u => u.AssetId == assetId)
            .MaxAsync(u => (int?)u.UnitNumber, ct) ?? 0;
        nextNumber += 1;

        var unit = new AssetUnit
        {
            TenantId = cu.TenantId!.Value,
            AssetId = assetId,
            UnitNumber = nextNumber,
            Status = asset.Status,
            SerialNumber = string.IsNullOrWhiteSpace(seed?.SerialNumber) ? null : seed.SerialNumber.Trim(),
            WarrantyUntil = seed?.WarrantyUntil ?? asset.WarrantyUntil,
            PurchasedOn = asset.PurchasedOn,
            PurchasePrice = asset.PurchasePrice,
            LocationId = asset.LocationId,
            LocationDetail = asset.LocationDetail,
            FieldValues = seed?.FieldValues is null
                ? null
                : JsonDocument.Parse(seed.FieldValues.Value.GetRawText()),
            CreatedBy = cu.UserId!.Value,
            UpdatedAt = DateTimeOffset.UtcNow,
        };

        var code = await AssetEndpoints.GenerateUniqueCode(db, cu.TenantId!.Value, ct);
        unit.Tags.Add(new AssetTag
        {
            TenantId = cu.TenantId!.Value,
            AssetId = assetId,
            UnitId = unit.Id,
            Code = code,
            Format = "QR",
        });

        db.AssetUnits.Add(unit);

        // Keep the asset.Quantity in sync — handy for non-tracked legacy views
        // and analytics that still read the column.
        asset.Quantity = await db.AssetUnits.CountAsync(u =>
            u.AssetId == assetId && u.DeletedAt == null, ct) + 1;
        asset.UpdatedAt = DateTimeOffset.UtcNow;

        audit.Log("Created", "AssetUnit", unit.Id,
            $"Added unit #{nextNumber} to '{asset.Name}'", new { unit.SerialNumber, code });
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(await BuildDetail(unit.Id, cu, db, http, ct));
    }

    // ── Get / Update / Delete ────────────────────────────────────────

    static async Task<Results<Ok<UnitDetailDto>, NotFound>> Get(
        Guid unitId, ICurrentUser cu, AppDbContext db, HttpRequest http, CancellationToken ct)
    {
        var dto = await BuildDetail(unitId, cu, db, http, ct);
        return dto is null ? TypedResults.NotFound() : TypedResults.Ok(dto);
    }

    static async Task<Results<Ok<UnitDetailDto>, NotFound, ForbidHttpResult, BadRequest<string>>> Update(
        Guid unitId, UnitUpdateRequest req, ICurrentUser cu, AppDbContext db,
        HttpRequest http, IAuditLogger audit, CancellationToken ct)
    {
        if (!cu.Can(Perms.AssetsWrite)) return TypedResults.Forbid();

        var unit = await db.AssetUnits
            .Include(u => u.Asset)
            .FirstOrDefaultAsync(u => u.Id == unitId && u.TenantId == cu.TenantId && u.DeletedAt == null, ct);
        if (unit is null) return TypedResults.NotFound();

        if (req.LocationId.HasValue)
        {
            var locExists = await db.Locations.AnyAsync(l =>
                l.Id == req.LocationId.Value && l.TenantId == cu.TenantId, ct);
            if (!locExists) return TypedResults.BadRequest("Location not found in this tenant.");
        }

        unit.SerialNumber = string.IsNullOrWhiteSpace(req.SerialNumber) ? null : req.SerialNumber.Trim();
        if (Enum.TryParse<AssetStatus>(req.Status, true, out var s)) unit.Status = s;
        unit.LocationId = req.LocationId;
        unit.LocationDetail = req.LocationDetail;
        if (req.FieldValues is not null)
            unit.FieldValues = JsonDocument.Parse(req.FieldValues.Value.GetRawText());
        unit.PurchasePrice = req.PurchasePrice;
        unit.PurchasedOn = req.PurchasedOn;
        unit.WarrantyUntil = req.WarrantyUntil;
        unit.UpdatedAt = DateTimeOffset.UtcNow;

        audit.Log("Updated", "AssetUnit", unit.Id,
            $"Updated unit #{unit.UnitNumber} of '{unit.Asset.Name}'",
            new { unit.SerialNumber, unit.Status });
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok((await BuildDetail(unitId, cu, db, http, ct))!);
    }

    static async Task<Results<NoContent, NotFound, ForbidHttpResult, BadRequest<string>>> Delete(
        Guid unitId, ICurrentUser cu, AppDbContext db, IAuditLogger audit, CancellationToken ct)
    {
        if (!cu.Can(Perms.AssetsWrite)) return TypedResults.Forbid();

        var unit = await db.AssetUnits
            .Include(u => u.Asset)
            .Include(u => u.Tags)
            .FirstOrDefaultAsync(u => u.Id == unitId && u.TenantId == cu.TenantId && u.DeletedAt == null, ct);
        if (unit is null) return TypedResults.NotFound();
        if (unit.AssignedToUserId.HasValue)
            return TypedResults.BadRequest("Check the unit in before deleting it.");

        unit.DeletedAt = DateTimeOffset.UtcNow;
        // Retire any active tags so scanning a label that's no longer attached
        // to a real unit returns 404 instead of pointing at a ghost.
        foreach (var tag in unit.Tags.Where(t => t.Status == AssetTagStatus.Active))
        {
            tag.Status = AssetTagStatus.Retired;
            tag.RetiredAt = DateTimeOffset.UtcNow;
        }
        unit.Asset.Quantity = Math.Max(unit.Asset.Quantity - 1, 0);
        unit.Asset.UpdatedAt = DateTimeOffset.UtcNow;

        audit.Log("Deleted", "AssetUnit", unit.Id,
            $"Deleted unit #{unit.UnitNumber} of '{unit.Asset.Name}'");
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    // ── Per-unit + batch check-out / check-in ────────────────────────

    static async Task<Results<Ok, NotFound, BadRequest<string>, ForbidHttpResult>> CheckOut(
        Guid unitId, UnitCheckOutRequest req, ICurrentUser cu, AppDbContext db,
        IAuditLogger audit, INotifier notifier, CancellationToken ct)
    {
        if (!cu.Can(Perms.AssetsCheckout)) return TypedResults.Forbid();

        var unit = await db.AssetUnits
            .Include(u => u.Asset)
            .FirstOrDefaultAsync(u => u.Id == unitId && u.TenantId == cu.TenantId && u.DeletedAt == null, ct);
        if (unit is null) return TypedResults.NotFound();
        if (unit.AssignedToUserId.HasValue)
            return TypedResults.BadRequest("This unit is already checked out. Check it in first.");

        var toUserId = req.ToUserId ?? cu.UserId!.Value;
        if (!await db.Memberships.AnyAsync(m => m.TenantId == cu.TenantId && m.UserId == toUserId, ct))
            return TypedResults.BadRequest("Recipient is not a member of this workspace.");

        ApplyCheckOut(unit, toUserId, req.ToLocation, req.Notes, cu, db);

        audit.Log("CheckedOut", "AssetUnit", unit.Id,
            $"Checked out unit #{unit.UnitNumber} of '{unit.Asset.Name}'",
            new { toUserId, unit.SerialNumber });
        if (toUserId != cu.UserId)
        {
            notifier.Notify(toUserId, "AssetAssigned",
                $"Unit checked out to you: {unit.Asset.Name} #{unit.UnitNumber}",
                $"Serial: {unit.SerialNumber ?? "—"}",
                $"/assets/{unit.AssetId}/units/{unit.Id}");
        }
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok();
    }

    static async Task<Results<Ok, NotFound, BadRequest<string>, ForbidHttpResult>> CheckIn(
        Guid unitId, UnitCheckInRequest req, ICurrentUser cu, AppDbContext db,
        IAuditLogger audit, CancellationToken ct)
    {
        if (!cu.Can(Perms.AssetsCheckout)) return TypedResults.Forbid();

        var unit = await db.AssetUnits
            .Include(u => u.Asset)
            .FirstOrDefaultAsync(u => u.Id == unitId && u.TenantId == cu.TenantId && u.DeletedAt == null, ct);
        if (unit is null) return TypedResults.NotFound();
        if (!unit.AssignedToUserId.HasValue)
            return TypedResults.BadRequest("This unit is not currently checked out.");

        ApplyCheckIn(unit, req.ToLocation, req.Notes, cu, db);
        audit.Log("CheckedIn", "AssetUnit", unit.Id,
            $"Checked in unit #{unit.UnitNumber} of '{unit.Asset.Name}'");
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok();
    }

    static async Task<Results<Ok<object>, NotFound, BadRequest<string>, ForbidHttpResult>> BatchCheckOut(
        Guid assetId, BatchCheckOutRequest req, ICurrentUser cu, AppDbContext db,
        IAuditLogger audit, INotifier notifier, CancellationToken ct)
    {
        if (!cu.Can(Perms.AssetsCheckout)) return TypedResults.Forbid();
        if (req.UnitIds is null || req.UnitIds.Count == 0)
            return TypedResults.BadRequest("Pick at least one unit to check out.");

        var asset = await db.Assets.FirstOrDefaultAsync(a =>
            a.Id == assetId && a.TenantId == cu.TenantId && a.DeletedAt == null, ct);
        if (asset is null) return TypedResults.NotFound();

        var toUserId = req.ToUserId ?? cu.UserId!.Value;
        if (!await db.Memberships.AnyAsync(m => m.TenantId == cu.TenantId && m.UserId == toUserId, ct))
            return TypedResults.BadRequest("Recipient is not a member of this workspace.");

        var units = await db.AssetUnits
            .Where(u => req.UnitIds.Contains(u.Id) && u.AssetId == assetId
                && u.TenantId == cu.TenantId && u.DeletedAt == null)
            .ToListAsync(ct);

        if (units.Count != req.UnitIds.Count)
            return TypedResults.BadRequest("Some units couldn't be found in this asset.");

        var alreadyOut = units.Where(u => u.AssignedToUserId.HasValue).Select(u => u.UnitNumber).ToList();
        if (alreadyOut.Count > 0)
            return TypedResults.BadRequest(
                $"Already checked out: {string.Join(", ", alreadyOut.Select(n => "#" + n))}. " +
                "Check them in or pick different units.");

        foreach (var unit in units)
            ApplyCheckOut(unit, toUserId, req.ToLocation, req.Notes, cu, db);

        audit.Log("CheckedOut", "Asset", assetId,
            $"Batch checked out {units.Count} units of '{asset.Name}'",
            new { toUserId, unitNumbers = units.Select(u => u.UnitNumber).ToArray() });

        if (toUserId != cu.UserId)
        {
            notifier.Notify(toUserId, "AssetAssigned",
                $"{units.Count} unit(s) of {asset.Name} checked out to you",
                $"Unit numbers: {string.Join(", ", units.OrderBy(u => u.UnitNumber).Select(u => "#" + u.UnitNumber))}",
                $"/assets/{assetId}");
        }

        await db.SaveChangesAsync(ct);
        return TypedResults.Ok<object>(new { count = units.Count });
    }

    static async Task<Results<Ok<object>, NotFound, BadRequest<string>, ForbidHttpResult>> BatchCheckIn(
        Guid assetId, BatchCheckInRequest req, ICurrentUser cu, AppDbContext db,
        IAuditLogger audit, CancellationToken ct)
    {
        if (!cu.Can(Perms.AssetsCheckout)) return TypedResults.Forbid();
        if (req.UnitIds is null || req.UnitIds.Count == 0)
            return TypedResults.BadRequest("Pick at least one unit to check in.");

        var asset = await db.Assets.FirstOrDefaultAsync(a =>
            a.Id == assetId && a.TenantId == cu.TenantId && a.DeletedAt == null, ct);
        if (asset is null) return TypedResults.NotFound();

        var units = await db.AssetUnits
            .Where(u => req.UnitIds.Contains(u.Id) && u.AssetId == assetId
                && u.TenantId == cu.TenantId && u.DeletedAt == null)
            .ToListAsync(ct);

        if (units.Count != req.UnitIds.Count)
            return TypedResults.BadRequest("Some units couldn't be found in this asset.");

        var notOut = units.Where(u => !u.AssignedToUserId.HasValue).Select(u => u.UnitNumber).ToList();
        if (notOut.Count > 0)
            return TypedResults.BadRequest(
                $"Not currently checked out: {string.Join(", ", notOut.Select(n => "#" + n))}.");

        foreach (var unit in units)
            ApplyCheckIn(unit, req.ToLocation, req.Notes, cu, db);

        audit.Log("CheckedIn", "Asset", assetId,
            $"Batch checked in {units.Count} units of '{asset.Name}'",
            new { unitNumbers = units.Select(u => u.UnitNumber).ToArray() });

        await db.SaveChangesAsync(ct);
        return TypedResults.Ok<object>(new { count = units.Count });
    }

    // ── Internals ────────────────────────────────────────────────────

    /// In-memory mutation only — caller is responsible for SaveChangesAsync.
    /// We factor this out so the per-unit and batch paths use the same code.
    static void ApplyCheckOut(AssetUnit unit, Guid toUserId, string? toLoc, string? notes,
        ICurrentUser cu, AppDbContext db)
    {
        var fromLoc = unit.LocationDetail;
        unit.AssignedToUserId = toUserId;
        if (!string.IsNullOrWhiteSpace(toLoc)) unit.LocationDetail = toLoc;
        unit.UpdatedAt = DateTimeOffset.UtcNow;
        db.AssetMovements.Add(new AssetMovement
        {
            TenantId = cu.TenantId!.Value,
            AssetId = unit.AssetId,
            UnitId = unit.Id,
            Kind = "CheckOut",
            FromLocation = fromLoc,
            ToLocation = unit.LocationDetail,
            ToUserId = toUserId,
            Notes = notes,
            PerformedBy = cu.UserId!.Value,
        });
    }

    static void ApplyCheckIn(AssetUnit unit, string? toLoc, string? notes,
        ICurrentUser cu, AppDbContext db)
    {
        var fromUserId = unit.AssignedToUserId;
        var fromLoc = unit.LocationDetail;
        unit.AssignedToUserId = null;
        if (!string.IsNullOrWhiteSpace(toLoc)) unit.LocationDetail = toLoc;
        unit.UpdatedAt = DateTimeOffset.UtcNow;
        db.AssetMovements.Add(new AssetMovement
        {
            TenantId = cu.TenantId!.Value,
            AssetId = unit.AssetId,
            UnitId = unit.Id,
            Kind = "CheckIn",
            FromUserId = fromUserId,
            FromLocation = fromLoc,
            ToLocation = unit.LocationDetail,
            Notes = notes,
            PerformedBy = cu.UserId!.Value,
        });
    }

    static async Task<UnitDetailDto?> BuildDetail(
        Guid unitId, ICurrentUser cu, AppDbContext db, HttpRequest http, CancellationToken ct)
    {
        var unit = await db.AssetUnits
            .Include(u => u.Asset)
            .Include(u => u.Location)
            .Include(u => u.AssignedToUser)
            .Include(u => u.Tags)
            .FirstOrDefaultAsync(u => u.Id == unitId && u.TenantId == cu.TenantId && u.DeletedAt == null, ct);
        if (unit is null) return null;

        var baseUrl = $"{http.Scheme}://{http.Host}";
        return new UnitDetailDto(
            unit.Id, unit.AssetId, unit.Asset.Name, unit.UnitNumber,
            unit.SerialNumber, unit.Status.ToString(),
            unit.LocationId, unit.Location?.Name, unit.LocationDetail,
            unit.FieldValues?.RootElement,
            unit.PurchasePrice, unit.PurchasedOn, unit.WarrantyUntil,
            unit.AssignedToUserId, unit.AssignedToUser?.DisplayName,
            unit.Tags.Select(t => new TagDto(
                t.Id, t.Code, t.Format, t.Status.ToString(), t.CreatedAt,
                $"{baseUrl}/api/tags/{t.Code}/qr.png")).ToList(),
            unit.CreatedAt, unit.UpdatedAt);
    }
}
