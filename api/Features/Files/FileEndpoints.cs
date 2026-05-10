using AssetHub.Api.Domain;
using AssetHub.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Features.Files;

public class StorageOptions
{
    public string UploadsPath { get; set; } = "./uploads";
}

public static class FileEndpoints
{
    static readonly HashSet<string> AllowedImageTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/webp", "image/gif",
    };

    public static void MapFileEndpoints(this IEndpointRouteBuilder app)
    {
        // Photo serving — anonymous access. Photo IDs are random GUIDs (122 bits
        // of entropy) so they're effectively unguessable. We use this trade-off
        // because <img src> can't send Authorization headers; doing signed-URL
        // tokens would add complexity not worth it for v1. If you need stricter
        // access, swap this for a signed-URL scheme later.
        app.MapGet("/api/files/photos/{photoId:guid}", GetPhoto)
            .AllowAnonymous().WithTags("Files");

        // Upload photo for an asset
        app.MapPost("/api/assets/{assetId:guid}/photos", UploadPhoto)
            .RequireAuthorization().WithTags("Files")
            .DisableAntiforgery();

        app.MapDelete("/api/assets/{assetId:guid}/photos/{photoId:guid}", DeletePhoto)
            .RequireAuthorization().WithTags("Files");

        app.MapPost("/api/assets/{assetId:guid}/photos/{photoId:guid}/cover", SetCover)
            .RequireAuthorization().WithTags("Files");
    }

    static async Task<Results<FileStreamHttpResult, NotFound>> GetPhoto(
        Guid photoId, AppDbContext db, StorageOptions storage, CancellationToken ct)
    {
        var photo = await db.AssetPhotos.FirstOrDefaultAsync(p => p.Id == photoId, ct);
        if (photo is null) return TypedResults.NotFound();

        var fullPath = Path.Combine(storage.UploadsPath, photo.StoragePath);
        if (!System.IO.File.Exists(fullPath)) return TypedResults.NotFound();

        var stream = System.IO.File.OpenRead(fullPath);
        return TypedResults.File(stream, photo.ContentType, photo.FileName);
    }

    static async Task<Results<Ok<object>, NotFound, BadRequest<string>, ForbidHttpResult>> UploadPhoto(
        Guid assetId, IFormFile file, ICurrentUser cu, AppDbContext db,
        StorageOptions storage, HttpRequest http, CancellationToken ct)
    {
        if (!cu.Can(Perms.AssetsWrite)) return TypedResults.Forbid();
        if (file is null || file.Length == 0) return TypedResults.BadRequest("No file uploaded.");
        if (file.Length > 10 * 1024 * 1024) return TypedResults.BadRequest("File too large (max 10MB).");
        if (!AllowedImageTypes.Contains(file.ContentType))
            return TypedResults.BadRequest($"Unsupported file type: {file.ContentType}");

        var asset = await db.Assets.FirstOrDefaultAsync(a =>
            a.Id == assetId && a.TenantId == cu.TenantId && a.DeletedAt == null, ct);
        if (asset is null) return TypedResults.NotFound();

        var ext = Path.GetExtension(file.FileName);
        if (string.IsNullOrEmpty(ext)) ext = ContentTypeToExt(file.ContentType);

        var photo = new AssetPhoto
        {
            TenantId = cu.TenantId!.Value,
            AssetId = assetId,
            FileName = Path.GetFileName(file.FileName),
            ContentType = file.ContentType,
            SizeBytes = file.Length,
            CreatedBy = cu.UserId!.Value,
        };

        // Path layout: {tenantId}/{assetId}/{photoId}{ext}
        var relPath = Path.Combine(
            cu.TenantId!.Value.ToString("N"),
            assetId.ToString("N"),
            $"{photo.Id:N}{ext}");
        var absPath = Path.Combine(storage.UploadsPath, relPath);
        Directory.CreateDirectory(Path.GetDirectoryName(absPath)!);

        using (var fs = System.IO.File.Create(absPath))
        {
            await file.CopyToAsync(fs, ct);
        }

        photo.StoragePath = relPath;

        // First photo becomes cover automatically
        var hasExisting = await db.AssetPhotos.AnyAsync(p => p.AssetId == assetId, ct);
        photo.IsCover = !hasExisting;

        db.AssetPhotos.Add(photo);
        await db.SaveChangesAsync(ct);

        var baseUrl = $"{http.Scheme}://{http.Host}";
        return TypedResults.Ok<object>(new
        {
            id = photo.Id,
            url = $"{baseUrl}/api/files/photos/{photo.Id}",
            isCover = photo.IsCover,
            sizeBytes = photo.SizeBytes,
        });
    }

    static async Task<Results<NoContent, NotFound, ForbidHttpResult>> DeletePhoto(
        Guid assetId, Guid photoId, ICurrentUser cu, AppDbContext db,
        StorageOptions storage, CancellationToken ct)
    {
        if (!cu.Can(Perms.AssetsWrite)) return TypedResults.Forbid();
        var photo = await db.AssetPhotos.FirstOrDefaultAsync(p =>
            p.Id == photoId && p.AssetId == assetId && p.TenantId == cu.TenantId, ct);
        if (photo is null) return TypedResults.NotFound();

        var fullPath = Path.Combine(storage.UploadsPath, photo.StoragePath);
        if (System.IO.File.Exists(fullPath))
        {
            try { System.IO.File.Delete(fullPath); } catch { /* best effort */ }
        }

        db.AssetPhotos.Remove(photo);
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    static async Task<Results<NoContent, NotFound, ForbidHttpResult>> SetCover(
        Guid assetId, Guid photoId, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.Can(Perms.AssetsWrite)) return TypedResults.Forbid();
        var photos = await db.AssetPhotos
            .Where(p => p.AssetId == assetId && p.TenantId == cu.TenantId)
            .ToListAsync(ct);
        if (!photos.Any(p => p.Id == photoId)) return TypedResults.NotFound();

        foreach (var p in photos) p.IsCover = p.Id == photoId;
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    static string ContentTypeToExt(string contentType) => contentType switch
    {
        "image/jpeg" => ".jpg",
        "image/png"  => ".png",
        "image/webp" => ".webp",
        "image/gif"  => ".gif",
        _ => ".bin",
    };
}
