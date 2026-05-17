using AssetHub.Api.Domain;
using AssetHub.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Features.RootAdmin;

// ── DTOs ────────────────────────────────────────────────────────────

public record RootUserDto(
    Guid Id,
    string Email,
    string DisplayName,
    string? Phone,
    bool IsActive,
    bool IsRootAdmin,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastLoginAt,
    DateTimeOffset? DeactivatedAt,
    IReadOnlyList<RootMembershipDto> Memberships);

public record RootMembershipDto(
    Guid TenantId, string TenantName, string Role, bool IsOwner);

public record RootTenantDto(
    Guid Id, string Name, string Slug, string Plan, string Status,
    DateTimeOffset CreatedAt, int MemberCount, int AssetCount);

public record RootUpdateActiveRequest(bool IsActive);
public record RootResetResponse(string ResetLink, DateTimeOffset ExpiresAt);

// ── Endpoints ───────────────────────────────────────────────────────

public static class RootAdminEndpoints
{
    public static void MapRootAdminEndpoints(this IEndpointRouteBuilder app)
    {
        // Every route in this group is gated by IsRootAdmin — guarded inside each
        // handler. We could have a custom auth policy but for one flag the
        // explicit check reads cleaner and matches the rest of the codebase.
        var grp = app.MapGroup("/api/root").RequireAuthorization().WithTags("RootAdmin");

        grp.MapGet("/users", ListUsers);
        grp.MapGet("/tenants", ListTenants);
        grp.MapPut("/users/{userId:guid}/active", UpdateActive);
        grp.MapPost("/users/{userId:guid}/reset-password", ResetPassword);
        grp.MapPut("/users/{userId:guid}/root", PromoteToRoot);
        grp.MapDelete("/users/{userId:guid}", DeleteUser);
    }

    static async Task<Results<Ok<List<RootUserDto>>, ForbidHttpResult>> ListUsers(
        ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.IsRootAdmin) return TypedResults.Forbid();

        var users = await db.Users
            .Include(u => u.Memberships).ThenInclude(m => m.Tenant)
            .OrderByDescending(u => u.IsRootAdmin)
            .ThenByDescending(u => u.CreatedAt)
            .ToListAsync(ct);

        var list = users.Select(u => new RootUserDto(
            u.Id, u.Email, u.DisplayName, u.Phone,
            u.IsActive, u.IsRootAdmin,
            u.CreatedAt, u.LastLoginAt, u.DeactivatedAt,
            u.Memberships.Select(m => new RootMembershipDto(
                m.TenantId, m.Tenant.Name, m.Role, m.IsOwner)).ToList()
        )).ToList();

        return TypedResults.Ok(list);
    }

    static async Task<Results<Ok<List<RootTenantDto>>, ForbidHttpResult>> ListTenants(
        ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.IsRootAdmin) return TypedResults.Forbid();

        // One round-trip with grouped counts beats N queries — fine for the
        // self-hosted scale this product targets (hundreds of tenants, not
        // hundreds of thousands).
        var tenants = await db.Tenants.OrderByDescending(t => t.CreatedAt).ToListAsync(ct);
        var memberCounts = await db.Memberships
            .GroupBy(m => m.TenantId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        var assetCounts = await db.Assets
            .Where(a => a.DeletedAt == null)
            .GroupBy(a => a.TenantId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);

        var list = tenants.Select(t => new RootTenantDto(
            t.Id, t.Name, t.Slug, t.Plan.ToString(), t.Status.ToString(), t.CreatedAt,
            memberCounts.GetValueOrDefault(t.Id, 0),
            assetCounts.GetValueOrDefault(t.Id, 0))).ToList();

        return TypedResults.Ok(list);
    }

    static async Task<Results<NoContent, NotFound, ForbidHttpResult, BadRequest<string>>> UpdateActive(
        Guid userId, RootUpdateActiveRequest req, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.IsRootAdmin) return TypedResults.Forbid();
        if (userId == cu.UserId) return TypedResults.BadRequest("You cannot deactivate yourself.");

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return TypedResults.NotFound();

        // Refuse to deactivate another root admin — gives us a path to remove
        // root from someone before locking them out, and prevents a single
        // compromised root from disabling all the others.
        if (user.IsRootAdmin && !req.IsActive)
            return TypedResults.BadRequest("Demote this user from root admin before deactivating them.");

        if (user.IsActive == req.IsActive) return TypedResults.NoContent();

        user.IsActive = req.IsActive;
        user.DeactivatedAt = req.IsActive ? null : DateTimeOffset.UtcNow;

        if (!req.IsActive)
        {
            var live = await db.RefreshTokens
                .Where(r => r.UserId == userId && r.RevokedAt == null)
                .ToListAsync(ct);
            foreach (var r in live) r.RevokedAt = DateTimeOffset.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    static async Task<Results<Ok<RootResetResponse>, NotFound, ForbidHttpResult>> ResetPassword(
        Guid userId, ICurrentUser cu, AppDbContext db, IJwtTokenService jwt,
        IEmailSender mail, HttpRequest http, CancellationToken ct)
    {
        if (!cu.IsRootAdmin) return TypedResults.Forbid();

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return TypedResults.NotFound();

        var (plain, hash, expires) = jwt.IssuePasswordResetToken();
        db.PasswordResetTokens.Add(new PasswordResetToken
        {
            UserId = userId,
            TokenHash = hash,
            Source = "Admin",
            IssuedByUserId = cu.UserId,
            ExpiresAt = expires,
        });
        await db.SaveChangesAsync(ct);

        var baseUrl = $"{http.Scheme}://{http.Host}";
        var link = $"{baseUrl}/reset-password?token={plain}";

        _ = mail.SendAsync(user.Email, "Password reset (AssetHub)",
            EmailTemplates.AdminPasswordReset(user.DisplayName, "AssetHub Platform", link));

        return TypedResults.Ok(new RootResetResponse(link, expires));
    }

    static async Task<Results<NoContent, NotFound, ForbidHttpResult, BadRequest<string>>> PromoteToRoot(
        Guid userId, RootUpdateActiveRequest req, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        // We reuse RootUpdateActiveRequest (IsActive boolean) as the "make-root" flag.
        // A dedicated DTO would be tidier but the semantics are the same.
        if (!cu.IsRootAdmin) return TypedResults.Forbid();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return TypedResults.NotFound();

        // Stop the last remaining root admin from demoting themselves and
        // orphaning the platform. They can promote someone else first.
        if (user.IsRootAdmin && !req.IsActive)
        {
            var roots = await db.Users.CountAsync(u => u.IsRootAdmin, ct);
            if (roots <= 1)
                return TypedResults.BadRequest("Cannot demote the last root admin. Promote someone else first.");
        }

        user.IsRootAdmin = req.IsActive;
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    static async Task<Results<NoContent, NotFound, ForbidHttpResult, BadRequest<string>>> DeleteUser(
        Guid userId, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.IsRootAdmin) return TypedResults.Forbid();
        if (userId == cu.UserId) return TypedResults.BadRequest("You cannot delete yourself.");

        var user = await db.Users
            .Include(u => u.Memberships)
            .FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return TypedResults.NotFound();

        if (user.IsRootAdmin)
            return TypedResults.BadRequest("Demote from root admin before deleting.");

        // Workspace owners drag their tenants down with them — refuse and let
        // the admin reassign the workspace first.
        if (user.Memberships.Any(m => m.IsOwner))
            return TypedResults.BadRequest("This user owns one or more workspaces. Reassign ownership first.");

        db.Users.Remove(user);
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }
}
