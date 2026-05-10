using AssetHub.Api.Domain;
using AssetHub.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace AssetHub.Api.Features.Catalog;

public record CategoryDto(Guid Id, Guid? ParentId, string Name, string? Icon, string? Color);
public record CategoryUpsert(string Name, Guid? ParentId, string? Icon, string? Color);

public record AssetTypeDto(Guid Id, Guid CategoryId, string Name, string? Icon, JsonElement? FieldSchema);
public record AssetTypeUpsert(string Name, Guid CategoryId, string? Icon, JsonElement? FieldSchema);

public static class CatalogEndpoints
{
    public static void MapCatalogEndpoints(this IEndpointRouteBuilder app)
    {
        var cat = app.MapGroup("/api/categories").RequireAuthorization().WithTags("Categories");
        cat.MapGet("/", ListCategories);
        cat.MapPost("/", CreateCategory);
        cat.MapPut("/{id:guid}", UpdateCategory);
        cat.MapDelete("/{id:guid}", DeleteCategory);

        var typ = app.MapGroup("/api/asset-types").RequireAuthorization().WithTags("AssetTypes");
        typ.MapGet("/", ListTypes);
        typ.MapGet("/{id:guid}", GetAssetType);
        typ.MapPost("/", CreateType);
        typ.MapPut("/{id:guid}", UpdateType);
        typ.MapDelete("/{id:guid}", DeleteType);
    }

    // ── Categories ────────────────────────────────────────────────────

    static async Task<Ok<List<CategoryDto>>> ListCategories(
        ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        var list = await db.Categories
            .Where(c => c.TenantId == cu.TenantId)
            .OrderBy(c => c.Name)
            .Select(c => new CategoryDto(c.Id, c.ParentId, c.Name, c.Icon, c.Color))
            .ToListAsync(ct);
        return TypedResults.Ok(list);
    }

    static async Task<Results<Ok<CategoryDto>, ForbidHttpResult>> CreateCategory(
        CategoryUpsert req, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.HasRole("Admin", "Manager")) return TypedResults.Forbid();
        var c = new AssetCategory
        {
            TenantId = cu.TenantId!.Value,
            Name = req.Name.Trim(),
            ParentId = req.ParentId,
            Icon = req.Icon,
            Color = req.Color,
        };
        db.Categories.Add(c);
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(new CategoryDto(c.Id, c.ParentId, c.Name, c.Icon, c.Color));
    }

    static async Task<Results<Ok<CategoryDto>, NotFound, ForbidHttpResult>> UpdateCategory(
        Guid id, CategoryUpsert req, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.HasRole("Admin", "Manager")) return TypedResults.Forbid();
        var c = await db.Categories.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == cu.TenantId, ct);
        if (c is null) return TypedResults.NotFound();
        c.Name = req.Name.Trim();
        c.ParentId = req.ParentId;
        c.Icon = req.Icon;
        c.Color = req.Color;
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(new CategoryDto(c.Id, c.ParentId, c.Name, c.Icon, c.Color));
    }

    static async Task<Results<NoContent, NotFound, Conflict<string>, ForbidHttpResult>> DeleteCategory(
        Guid id, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.HasRole("Admin", "Manager")) return TypedResults.Forbid();
        var c = await db.Categories.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == cu.TenantId, ct);
        if (c is null) return TypedResults.NotFound();
        var inUse = await db.AssetTypes.AnyAsync(t => t.CategoryId == id, ct);
        if (inUse) return TypedResults.Conflict("Category has asset types attached.");
        db.Categories.Remove(c);
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    // ── Asset Types ───────────────────────────────────────────────────

    static async Task<Ok<List<AssetTypeDto>>> ListTypes(
        ICurrentUser cu, AppDbContext db, CancellationToken ct, Guid? categoryId = null)
    {
        var q = db.AssetTypes.Where(t => t.TenantId == cu.TenantId);
        if (categoryId.HasValue) q = q.Where(t => t.CategoryId == categoryId.Value);
        var list = await q.OrderBy(t => t.Name).ToListAsync(ct);
        // Use the JsonDocument's own RootElement directly. EF owns the document
        // and the serializer reads it before the DbContext is disposed. No need
        // to round-trip through JsonDocument.Parse (which leaks docs to GC).
        return TypedResults.Ok(list.Select(t => new AssetTypeDto(
            t.Id, t.CategoryId, t.Name, t.Icon, t.FieldSchema?.RootElement
        )).ToList());
    }

    static async Task<Results<Ok<AssetTypeDto>, NotFound>> GetAssetType(
        Guid id, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        var t = await db.AssetTypes.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == cu.TenantId, ct);
        if (t is null) return TypedResults.NotFound();
        return TypedResults.Ok(new AssetTypeDto(
            t.Id, t.CategoryId, t.Name, t.Icon,
            t.FieldSchema is null ? null : t.FieldSchema.RootElement));
    }

    static async Task<Results<Ok<AssetTypeDto>, ForbidHttpResult, BadRequest<string>>> CreateType(
        AssetTypeUpsert req, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.HasRole("Admin", "Manager")) return TypedResults.Forbid();
        if (!await db.Categories.AnyAsync(c => c.Id == req.CategoryId && c.TenantId == cu.TenantId, ct))
            return TypedResults.BadRequest("Category not found in this tenant.");

        var t = new AssetType
        {
            TenantId = cu.TenantId!.Value,
            CategoryId = req.CategoryId,
            Name = req.Name.Trim(),
            Icon = req.Icon,
            FieldSchema = req.FieldSchema is null
                ? JsonDocument.Parse("[]")
                : JsonDocument.Parse(req.FieldSchema.Value.GetRawText()),
        };
        db.AssetTypes.Add(t);
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(new AssetTypeDto(t.Id, t.CategoryId, t.Name, t.Icon, t.FieldSchema?.RootElement));
    }

    static async Task<Results<Ok<AssetTypeDto>, NotFound, ForbidHttpResult>> UpdateType(
        Guid id, AssetTypeUpsert req, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.HasRole("Admin", "Manager")) return TypedResults.Forbid();
        var t = await db.AssetTypes.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == cu.TenantId, ct);
        if (t is null) return TypedResults.NotFound();
        t.Name = req.Name.Trim();
        t.CategoryId = req.CategoryId;
        t.Icon = req.Icon;
        if (req.FieldSchema is not null)
            t.FieldSchema = JsonDocument.Parse(req.FieldSchema.Value.GetRawText());
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(new AssetTypeDto(t.Id, t.CategoryId, t.Name, t.Icon, t.FieldSchema?.RootElement));
    }

    static async Task<Results<NoContent, NotFound, Conflict<string>, ForbidHttpResult>> DeleteType(
        Guid id, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.HasRole("Admin", "Manager")) return TypedResults.Forbid();
        var t = await db.AssetTypes.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == cu.TenantId, ct);
        if (t is null) return TypedResults.NotFound();
        var inUse = await db.Assets.AnyAsync(a => a.AssetTypeId == id, ct);
        if (inUse) return TypedResults.Conflict("Asset type has assets attached.");
        db.AssetTypes.Remove(t);
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }
}
