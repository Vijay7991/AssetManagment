using AssetHub.Api.Domain;
using AssetHub.Api.Features.Assets;
using AssetHub.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Features.Tags;

public record TagPrintItem(string Code, string AssetName, string QrSvg);

public static class TagEndpoints
{
    public static void MapTagEndpoints(this IEndpointRouteBuilder app)
    {
        // Public route — needed for QR images embedded in printed labels.
        // Returns the QR for any tag code without leaking asset info.
        app.MapGet("/api/tags/{code}/qr.png", QrPng).AllowAnonymous().WithTags("Tags");
        app.MapGet("/api/tags/{code}/qr.svg", QrSvg).AllowAnonymous().WithTags("Tags");

        var grp = app.MapGroup("/api/tags").RequireAuthorization().WithTags("Tags");
        grp.MapGet("/scan/{code}", Scan);
        grp.MapPost("/by-asset/{assetId:guid}", CreateForAsset);
        grp.MapPost("/{id:guid}/retire", Retire);
        grp.MapPost("/print", BuildPrintSheet);
    }

    static IResult QrPng(string code, IBarcodeRenderer renderer, HttpRequest http)
    {
        var payload = $"{http.Scheme}://{http.Host}/t/{code}";
        var bytes = renderer.RenderQrPng(payload, pixelsPerModule: 8);
        return Results.File(bytes, "image/png");
    }

    static IResult QrSvg(string code, IBarcodeRenderer renderer, HttpRequest http)
    {
        var payload = $"{http.Scheme}://{http.Host}/t/{code}";
        var svg = renderer.RenderQrSvg(payload);
        return Results.Content(svg, "image/svg+xml");
    }

    /// Scan lookup. Returns the asset detail for a given tag code, scoped to the
    /// caller's tenant. 404 if the code doesn't exist or belongs to another tenant
    /// (don't leak existence).
    static async Task<Results<Ok<AssetDetailDto>, NotFound>> Scan(
        string code, ICurrentUser cu, AppDbContext db, HttpRequest http, CancellationToken ct)
    {
        var tag = await db.AssetTags
            .Include(t => t.Asset).ThenInclude(a => a.AssetType).ThenInclude(t => t.Category)
            .Include(t => t.Asset).ThenInclude(a => a.Tags)
            .Include(t => t.Asset).ThenInclude(a => a.Photos)
            .Include(t => t.Asset).ThenInclude(a => a.AssignedToUser)
            .FirstOrDefaultAsync(t =>
                t.Code == code &&
                t.TenantId == cu.TenantId &&
                t.Status == AssetTagStatus.Active &&
                t.Asset.DeletedAt == null, ct);
        if (tag is null) return TypedResults.NotFound();

        return TypedResults.Ok(MapAssetDetail(tag.Asset, http));
    }

    static async Task<Results<Ok<TagDto>, NotFound, ForbidHttpResult>> CreateForAsset(
        Guid assetId, ICurrentUser cu, AppDbContext db, HttpRequest http, CancellationToken ct)
    {
        if (!cu.HasRole("Admin", "Manager")) return TypedResults.Forbid();
        var asset = await db.Assets.FirstOrDefaultAsync(a =>
            a.Id == assetId && a.TenantId == cu.TenantId && a.DeletedAt == null, ct);
        if (asset is null) return TypedResults.NotFound();

        string code;
        for (int i = 0; ; i++)
        {
            code = TagCodeGenerator.Generate();
            if (!await db.AssetTags.AnyAsync(t => t.TenantId == cu.TenantId && t.Code == code, ct)) break;
            if (i > 5) throw new InvalidOperationException("Could not allocate unique tag code");
        }
        var tag = new AssetTag
        {
            TenantId = cu.TenantId!.Value,
            AssetId = assetId,
            Code = code,
            Format = "QR",
        };
        db.AssetTags.Add(tag);
        await db.SaveChangesAsync(ct);

        var baseUrl = $"{http.Scheme}://{http.Host}";
        return TypedResults.Ok(new TagDto(
            tag.Id, tag.Code, tag.Format, tag.Status.ToString(), tag.CreatedAt,
            $"{baseUrl}/api/tags/{tag.Code}/qr.png"));
    }

    static async Task<Results<NoContent, NotFound, ForbidHttpResult>> Retire(
        Guid id, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.HasRole("Admin", "Manager")) return TypedResults.Forbid();
        var tag = await db.AssetTags.FirstOrDefaultAsync(t => t.Id == id && t.TenantId == cu.TenantId, ct);
        if (tag is null) return TypedResults.NotFound();
        tag.Status = AssetTagStatus.Retired;
        tag.RetiredAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    public record PrintSheetRequest(IReadOnlyList<Guid> AssetIds);

    static async Task<Ok<List<TagPrintItem>>> BuildPrintSheet(
        PrintSheetRequest req, ICurrentUser cu, AppDbContext db,
        IBarcodeRenderer renderer, HttpRequest http, CancellationToken ct)
    {
        var tags = await db.AssetTags
            .Include(t => t.Asset)
            .Where(t => t.TenantId == cu.TenantId
                && t.Status == AssetTagStatus.Active
                && req.AssetIds.Contains(t.AssetId))
            .ToListAsync(ct);

        var now = DateTimeOffset.UtcNow;
        foreach (var t in tags) t.PrintedAt = now;
        await db.SaveChangesAsync(ct);

        var baseUrl = $"{http.Scheme}://{http.Host}";
        var items = tags.Select(t => new TagPrintItem(
            t.Code,
            t.Asset.Name,
            renderer.RenderQrSvg($"{baseUrl}/t/{t.Code}"))).ToList();
        return TypedResults.Ok(items);
    }

    // Inline mapper for tag scan responses
    static AssetDetailDto MapAssetDetail(Asset a, HttpRequest http)
    {
        var baseUrl = $"{http.Scheme}://{http.Host}";
        return new AssetDetailDto(
            a.Id, a.Name, a.Description, a.Location, a.Quantity, a.Status.ToString(),
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
}
