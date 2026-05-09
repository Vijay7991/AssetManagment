using AssetHub.Api.Domain;
using AssetHub.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Features.Notifications;

public record NotificationDto(
    Guid Id, string Kind, string Title, string? Body, string? Link,
    DateTimeOffset CreatedAt, DateTimeOffset? ReadAt);

public record UnreadCountDto(int Count);

public static class NotificationEndpoints
{
    public static void MapNotificationEndpoints(this IEndpointRouteBuilder app)
    {
        var grp = app.MapGroup("/api/notifications").RequireAuthorization().WithTags("Notifications");
        grp.MapGet("/", List);
        grp.MapGet("/unread-count", UnreadCount);
        grp.MapPost("/{id:guid}/read", MarkRead);
        grp.MapPost("/read-all", MarkAllRead);
    }

    static async Task<Ok<List<NotificationDto>>> List(
        ICurrentUser cu, AppDbContext db, CancellationToken ct, int take = 50)
    {
        if (take is < 1 or > 200) take = 50;
        var list = await db.Notifications
            .Where(n => n.TenantId == cu.TenantId && n.UserId == cu.UserId)
            .OrderByDescending(n => n.CreatedAt)
            .Take(take)
            .Select(n => new NotificationDto(n.Id, n.Kind, n.Title, n.Body, n.Link, n.CreatedAt, n.ReadAt))
            .ToListAsync(ct);
        return TypedResults.Ok(list);
    }

    static async Task<Ok<UnreadCountDto>> UnreadCount(
        ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        var c = await db.Notifications.CountAsync(n =>
            n.TenantId == cu.TenantId && n.UserId == cu.UserId && n.ReadAt == null, ct);
        return TypedResults.Ok(new UnreadCountDto(c));
    }

    static async Task<Results<NoContent, NotFound>> MarkRead(
        Guid id, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        var n = await db.Notifications.FirstOrDefaultAsync(x =>
            x.Id == id && x.TenantId == cu.TenantId && x.UserId == cu.UserId, ct);
        if (n is null) return TypedResults.NotFound();
        n.ReadAt ??= DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    static async Task<NoContent> MarkAllRead(
        ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        var unread = await db.Notifications
            .Where(n => n.TenantId == cu.TenantId && n.UserId == cu.UserId && n.ReadAt == null)
            .ToListAsync(ct);
        var now = DateTimeOffset.UtcNow;
        foreach (var n in unread) n.ReadAt = now;
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }
}
