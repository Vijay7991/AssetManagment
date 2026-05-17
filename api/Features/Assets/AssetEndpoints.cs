using AssetHub.Api.Domain;
using AssetHub.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace AssetHub.Api.Features.Assets;

public record AssetListItemDto(
    Guid Id,
    string Name,
    string AssetType,
    string Status,
    int Quantity,
    Guid? LocationId,
    string? LocationName,
    string? LocationDetail,
    string? CoverPhotoUrl,
    string? PrimaryTagCode,
    DateTimeOffset CreatedAt);

public record AssetDetailDto(
    Guid Id,
    string Name,
    string? Description,
    Guid? LocationId,
    string? LocationName,
    string? LocationDetail,
    int Quantity,
    string Status,
    Guid AssetTypeId,
    string AssetTypeName,
    Guid CategoryId,
    string CategoryName,
    JsonElement? FieldValues,
    decimal? PurchasePrice,
    DateOnly? PurchasedOn,
    DateOnly? WarrantyUntil,
    Guid? AssignedToUserId,
    string? AssignedToName,
    IReadOnlyList<TagDto> Tags,
    IReadOnlyList<PhotoDto> Photos,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record TagDto(Guid Id, string Code, string Format, string Status, DateTimeOffset CreatedAt, string QrUrl);
public record PhotoDto(Guid Id, string Url, bool IsCover, long SizeBytes);

public record AssetCreateRequest(
    string Name,
    Guid AssetTypeId,
    string? Description,
    Guid? LocationId,
    string? LocationDetail,
    int Quantity,
    string? Status,
    JsonElement? FieldValues,
    decimal? PurchasePrice,
    DateOnly? PurchasedOn,
    DateOnly? WarrantyUntil);

public record AssetUpdateRequest(
    string Name,
    string? Description,
    Guid? LocationId,
    string? LocationDetail,
    int Quantity,
    string? Status,
    JsonElement? FieldValues,
    decimal? PurchasePrice,
    DateOnly? PurchasedOn,
    DateOnly? WarrantyUntil,
    Guid? AssignedToUserId);

public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

public static class AssetEndpoints
{
    public static void MapAssetEndpoints(this IEndpointRouteBuilder app)
    {
        var grp = app.MapGroup("/api/assets").RequireAuthorization().WithTags("Assets");

        grp.MapGet("/", List);
        grp.MapGet("/{id:guid}", Get);
        grp.MapPost("/", Create);
        grp.MapPut("/{id:guid}", Update);
        grp.MapDelete("/{id:guid}", Delete);
        grp.MapGet("/stats", Stats);
    }

    static async Task<Ok<PagedResult<AssetListItemDto>>> List(
        ICurrentUser cu, AppDbContext db, HttpRequest http, CancellationToken ct,
        string? q = null,
        Guid? categoryId = null,
        Guid? typeId = null,
        Guid? locationId = null,
        string? status = null,
        bool warrantyExpiring = false,
        int page = 1,
        int pageSize = 25)
    {
        if (page < 1) page = 1;
        if (pageSize is < 1 or > 200) pageSize = 25;

        var query = db.Assets
            .Where(a => a.TenantId == cu.TenantId && a.DeletedAt == null);

        if (!string.IsNullOrWhiteSpace(q))
        {
            var pattern = $"%{q.Trim()}%";
            query = query.Where(a =>
                EF.Functions.ILike(a.Name, pattern) ||
                (a.Description != null && EF.Functions.ILike(a.Description, pattern)));
        }
        if (typeId.HasValue) query = query.Where(a => a.AssetTypeId == typeId.Value);
        if (categoryId.HasValue) query = query.Where(a => a.AssetType.CategoryId == categoryId.Value);
        if (locationId.HasValue) query = query.Where(a => a.LocationId == locationId.Value);
        if (Enum.TryParse<AssetStatus>(status, true, out var st)) query = query.Where(a => a.Status == st);
        if (warrantyExpiring)
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var cutoff = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(30));
            query = query.Where(a => a.WarrantyUntil != null && a.WarrantyUntil >= today && a.WarrantyUntil <= cutoff);
        }

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new
            {
                a.Id, a.Name, AssetType = a.AssetType.Name, a.Status, a.Quantity,
                a.LocationId, LocationName = a.Location != null ? a.Location.Name : null,
                a.LocationDetail, a.CreatedAt,
                Cover = a.Photos.Where(p => p.IsCover).Select(p => p.Id).FirstOrDefault(),
                FirstTag = a.Tags.Where(t => t.Status == AssetTagStatus.Active).Select(t => t.Code).FirstOrDefault(),
            })
            .ToListAsync(ct);

        var baseUrl = $"{http.Scheme}://{http.Host}";
        var dtos = items.Select(i => new AssetListItemDto(
            i.Id, i.Name, i.AssetType, i.Status.ToString(), i.Quantity,
            i.LocationId, i.LocationName, i.LocationDetail,
            i.Cover == Guid.Empty ? null : $"{baseUrl}/api/files/photos/{i.Cover}",
            i.FirstTag,
            i.CreatedAt)).ToList();

        return TypedResults.Ok(new PagedResult<AssetListItemDto>(dtos, total, page, pageSize));
    }

    static async Task<Results<Ok<AssetDetailDto>, NotFound>> Get(
        Guid id, ICurrentUser cu, AppDbContext db, HttpRequest http, CancellationToken ct)
    {
        var asset = await db.Assets
            .Include(a => a.AssetType).ThenInclude(t => t.Category)
            .Include(a => a.Location)
            .Include(a => a.Tags)
            .Include(a => a.Photos)
            .Include(a => a.AssignedToUser)
            .FirstOrDefaultAsync(a => a.Id == id && a.TenantId == cu.TenantId && a.DeletedAt == null, ct);
        if (asset is null) return TypedResults.NotFound();

        return TypedResults.Ok(MapDetail(asset, http));
    }

    static async Task<Results<Ok<AssetDetailDto>, ForbidHttpResult, BadRequest<string>>> Create(
        AssetCreateRequest req, ICurrentUser cu, AppDbContext db, HttpRequest http,
        IBarcodeRenderer _, IAuditLogger audit, CancellationToken ct)
    {
        if (!cu.Can(Perms.AssetsWrite)) return TypedResults.Forbid();

        var assetType = await db.AssetTypes
            .Include(t => t.Category)
            .FirstOrDefaultAsync(t => t.Id == req.AssetTypeId && t.TenantId == cu.TenantId, ct);
        if (assetType is null) return TypedResults.BadRequest("Asset type not found.");

        var status = Enum.TryParse<AssetStatus>(req.Status, true, out var s) ? s : AssetStatus.InService;

        // Validate location belongs to this tenant if provided
        if (req.LocationId.HasValue)
        {
            var locExists = await db.Locations.AnyAsync(l =>
                l.Id == req.LocationId.Value && l.TenantId == cu.TenantId, ct);
            if (!locExists) return TypedResults.BadRequest("Location not found in this tenant.");
        }

        var asset = new Asset
        {
            TenantId = cu.TenantId!.Value,
            AssetTypeId = req.AssetTypeId,
            LocationId = req.LocationId,
            Name = req.Name.Trim(),
            Description = req.Description,
            LocationDetail = req.LocationDetail,
            Quantity = req.Quantity > 0 ? req.Quantity : 1,
            Status = status,
            FieldValues = req.FieldValues is null ? null : JsonDocument.Parse(req.FieldValues.Value.GetRawText()),
            PurchasePrice = req.PurchasePrice,
            PurchasedOn = req.PurchasedOn,
            WarrantyUntil = req.WarrantyUntil,
            CreatedBy = cu.UserId!.Value,
            UpdatedAt = DateTimeOffset.UtcNow,
        };

        // Auto-generate first tag
        var code = await GenerateUniqueCode(db, cu.TenantId!.Value, ct);
        asset.Tags.Add(new AssetTag
        {
            TenantId = cu.TenantId!.Value,
            AssetId = asset.Id,
            Code = code,
            Format = "QR",
        });

        db.Assets.Add(asset);
        audit.Log("Created", "Asset", asset.Id, $"Created asset '{asset.Name}'", new { asset.Name, asset.AssetTypeId, code });
        await db.SaveChangesAsync(ct);

        // Reload with includes
        var created = await db.Assets
            .Include(a => a.AssetType).ThenInclude(t => t.Category)
            .Include(a => a.Location)
            .Include(a => a.Tags)
            .Include(a => a.Photos)
            .Include(a => a.AssignedToUser)
            .FirstAsync(a => a.Id == asset.Id, ct);

        return TypedResults.Ok(MapDetail(created, http));
    }

    static async Task<Results<Ok<AssetDetailDto>, NotFound, ForbidHttpResult, BadRequest<string>>> Update(
        Guid id, AssetUpdateRequest req, ICurrentUser cu, AppDbContext db, HttpRequest http,
        IAuditLogger audit, CancellationToken ct)
    {
        if (!cu.Can(Perms.AssetsWrite)) return TypedResults.Forbid();
        var asset = await db.Assets
            .Include(a => a.AssetType).ThenInclude(t => t.Category)
            .Include(a => a.Location)
            .Include(a => a.Tags)
            .Include(a => a.Photos)
            .Include(a => a.AssignedToUser)
            .FirstOrDefaultAsync(a => a.Id == id && a.TenantId == cu.TenantId && a.DeletedAt == null, ct);
        if (asset is null) return TypedResults.NotFound();

        if (req.LocationId.HasValue)
        {
            var locExists = await db.Locations.AnyAsync(l =>
                l.Id == req.LocationId.Value && l.TenantId == cu.TenantId, ct);
            if (!locExists) return TypedResults.BadRequest("Location not found in this tenant.");
        }

        asset.Name = req.Name.Trim();
        asset.Description = req.Description;
        asset.LocationId = req.LocationId;
        asset.LocationDetail = req.LocationDetail;
        asset.Quantity = req.Quantity > 0 ? req.Quantity : 1;
        if (Enum.TryParse<AssetStatus>(req.Status, true, out var s)) asset.Status = s;
        if (req.FieldValues is not null)
            asset.FieldValues = JsonDocument.Parse(req.FieldValues.Value.GetRawText());
        asset.PurchasePrice = req.PurchasePrice;
        asset.PurchasedOn = req.PurchasedOn;
        asset.WarrantyUntil = req.WarrantyUntil;
        asset.AssignedToUserId = req.AssignedToUserId;
        asset.UpdatedAt = DateTimeOffset.UtcNow;

        // Reload location nav after change so the response carries the new name
        if (asset.LocationId.HasValue && asset.Location?.Id != asset.LocationId)
            asset.Location = await db.Locations.FindAsync(new object?[] { asset.LocationId.Value }, ct);
        else if (asset.LocationId is null) asset.Location = null;

        audit.Log("Updated", "Asset", asset.Id, $"Updated asset '{asset.Name}'", new { asset.Status });
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(MapDetail(asset, http));
    }

    static async Task<Results<NoContent, NotFound, ForbidHttpResult>> Delete(
        Guid id, ICurrentUser cu, AppDbContext db, IAuditLogger audit, CancellationToken ct)
    {
        if (!cu.Can(Perms.AssetsWrite)) return TypedResults.Forbid();
        var asset = await db.Assets.FirstOrDefaultAsync(a => a.Id == id && a.TenantId == cu.TenantId, ct);
        if (asset is null) return TypedResults.NotFound();
        asset.DeletedAt = DateTimeOffset.UtcNow;
        audit.Log("Deleted", "Asset", asset.Id, $"Deleted asset '{asset.Name}'");
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    static async Task<Ok<object>> Stats(ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        var total = await db.Assets.CountAsync(a => a.TenantId == cu.TenantId && a.DeletedAt == null, ct);
        var byStatus = await db.Assets
            .Where(a => a.TenantId == cu.TenantId && a.DeletedAt == null)
            .GroupBy(a => a.Status)
            .Select(g => new { Status = g.Key.ToString(), Count = g.Count() })
            .ToListAsync(ct);
        var recentlyAdded = await db.Assets
            .Where(a => a.TenantId == cu.TenantId && a.DeletedAt == null)
            .OrderByDescending(a => a.CreatedAt)
            .Take(5)
            .Select(a => new { a.Id, a.Name, a.CreatedAt })
            .ToListAsync(ct);
        var warrantyExpiringSoon = await db.Assets
            .Where(a => a.TenantId == cu.TenantId && a.DeletedAt == null
                && a.WarrantyUntil != null
                && a.WarrantyUntil >= DateOnly.FromDateTime(DateTime.UtcNow)
                && a.WarrantyUntil <= DateOnly.FromDateTime(DateTime.UtcNow.AddDays(30)))
            .CountAsync(ct);

        return TypedResults.Ok<object>(new
        {
            total,
            byStatus,
            recentlyAdded,
            warrantyExpiringSoon,
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────

    static AssetDetailDto MapDetail(Asset a, HttpRequest http)
    {
        var baseUrl = $"{http.Scheme}://{http.Host}";
        return new AssetDetailDto(
            a.Id, a.Name, a.Description,
            a.LocationId, a.Location?.Name, a.LocationDetail,
            a.Quantity, a.Status.ToString(),
            a.AssetTypeId, a.AssetType.Name, a.AssetType.CategoryId, a.AssetType.Category.Name,
            a.FieldValues?.RootElement,
            a.PurchasePrice, a.PurchasedOn, a.WarrantyUntil,
            a.AssignedToUserId, a.AssignedToUser?.DisplayName,
            a.Tags.Select(t => new TagDto(
                t.Id, t.Code, t.Format, t.Status.ToString(), t.CreatedAt,
                $"{baseUrl}/api/tags/{t.Code}/qr.png")).ToList(),
            a.Photos.Select(p => new PhotoDto(
                p.Id, $"{baseUrl}/api/files/photos/{p.Id}", p.IsCover, p.SizeBytes)).ToList(),
            a.CreatedAt, a.UpdatedAt);
    }

    static async Task<string> GenerateUniqueCode(AppDbContext db, Guid tenantId, CancellationToken ct)
    {
        for (int attempt = 0; attempt < 5; attempt++)
        {
            var code = TagCodeGenerator.Generate();
            var exists = await db.AssetTags.AnyAsync(t => t.TenantId == tenantId && t.Code == code, ct);
            if (!exists) return code;
        }
        throw new InvalidOperationException("Could not generate unique tag code after 5 attempts.");
    }
}
