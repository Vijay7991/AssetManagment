using AssetHub.Api.Domain;
using AssetHub.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Features.Locations;

public record LocationDto(
    Guid Id, string Name, string? Code, string? City, string? Region, string? Country,
    string? Address, bool IsActive, int AssetCount);

public record LocationUpsert(
    string Name, string? Code, string? City, string? Region, string? Country,
    string? Address, bool? IsActive);

public static class LocationEndpoints
{
    public static void MapLocationEndpoints(this IEndpointRouteBuilder app)
    {
        var grp = app.MapGroup("/api/locations").RequireAuthorization().WithTags("Locations");
        grp.MapGet("/", List);
        grp.MapPost("/", Create);
        grp.MapPut("/{id:guid}", Update);
        grp.MapDelete("/{id:guid}", Delete);
    }

    static async Task<Ok<List<LocationDto>>> List(
        ICurrentUser cu, AppDbContext db, CancellationToken ct, bool includeInactive = false)
    {
        var q = db.Locations.Where(l => l.TenantId == cu.TenantId);
        if (!includeInactive) q = q.Where(l => l.IsActive);

        var locs = await q.OrderBy(l => l.Name).ToListAsync(ct);
        var assetCounts = await db.Assets
            .Where(a => a.TenantId == cu.TenantId && a.DeletedAt == null && a.LocationId != null)
            .GroupBy(a => a.LocationId!.Value)
            .Select(g => new { LocationId = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var counts = assetCounts.ToDictionary(x => x.LocationId, x => x.Count);

        return TypedResults.Ok(locs.Select(l => new LocationDto(
            l.Id, l.Name, l.Code, l.City, l.Region, l.Country, l.Address, l.IsActive,
            counts.TryGetValue(l.Id, out var c) ? c : 0)).ToList());
    }

    static async Task<Results<Ok<LocationDto>, ForbidHttpResult, BadRequest<string>>> Create(
        LocationUpsert req, ICurrentUser cu, AppDbContext db,
        IAuditLogger audit, CancellationToken ct)
    {
        if (!cu.Can(Perms.CatalogWrite)) return TypedResults.Forbid();
        if (string.IsNullOrWhiteSpace(req.Name)) return TypedResults.BadRequest("Name is required.");

        var loc = new Location
        {
            TenantId = cu.TenantId!.Value,
            Name = req.Name.Trim(),
            Code = string.IsNullOrWhiteSpace(req.Code) ? null : req.Code.Trim().ToUpperInvariant(),
            City = req.City?.Trim(),
            Region = req.Region?.Trim(),
            Country = req.Country?.Trim(),
            Address = req.Address?.Trim(),
            IsActive = req.IsActive ?? true,
        };
        db.Locations.Add(loc);
        audit.Log("Created", "Location", loc.Id, $"Created location '{loc.Name}'");
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(new LocationDto(
            loc.Id, loc.Name, loc.Code, loc.City, loc.Region, loc.Country,
            loc.Address, loc.IsActive, 0));
    }

    static async Task<Results<Ok<LocationDto>, NotFound, ForbidHttpResult>> Update(
        Guid id, LocationUpsert req, ICurrentUser cu, AppDbContext db,
        IAuditLogger audit, CancellationToken ct)
    {
        if (!cu.Can(Perms.CatalogWrite)) return TypedResults.Forbid();
        var loc = await db.Locations.FirstOrDefaultAsync(l => l.Id == id && l.TenantId == cu.TenantId, ct);
        if (loc is null) return TypedResults.NotFound();

        loc.Name = req.Name?.Trim() ?? loc.Name;
        loc.Code = string.IsNullOrWhiteSpace(req.Code) ? null : req.Code.Trim().ToUpperInvariant();
        loc.City = req.City?.Trim();
        loc.Region = req.Region?.Trim();
        loc.Country = req.Country?.Trim();
        loc.Address = req.Address?.Trim();
        if (req.IsActive.HasValue) loc.IsActive = req.IsActive.Value;

        audit.Log("Updated", "Location", loc.Id, $"Updated location '{loc.Name}'");
        await db.SaveChangesAsync(ct);

        var assetCount = await db.Assets.CountAsync(a =>
            a.LocationId == loc.Id && a.DeletedAt == null, ct);
        return TypedResults.Ok(new LocationDto(
            loc.Id, loc.Name, loc.Code, loc.City, loc.Region, loc.Country,
            loc.Address, loc.IsActive, assetCount));
    }

    static async Task<Results<NoContent, NotFound, Conflict<string>, ForbidHttpResult>> Delete(
        Guid id, ICurrentUser cu, AppDbContext db, IAuditLogger audit, CancellationToken ct)
    {
        if (!cu.Can(Perms.CatalogWrite)) return TypedResults.Forbid();
        var loc = await db.Locations.FirstOrDefaultAsync(l => l.Id == id && l.TenantId == cu.TenantId, ct);
        if (loc is null) return TypedResults.NotFound();

        var inUse = await db.Assets.AnyAsync(a => a.LocationId == id && a.DeletedAt == null, ct);
        if (inUse) return TypedResults.Conflict("Location has assets. Reassign them first or mark the location inactive.");

        db.Locations.Remove(loc);
        audit.Log("Deleted", "Location", id, $"Deleted location '{loc.Name}'");
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }
}
