using AssetHub.Api.Domain;
using AssetHub.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Features.Auth;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var grp = app.MapGroup("/api/auth").WithTags("Auth");

        grp.MapPost("/signup", Signup).AllowAnonymous();
        grp.MapPost("/login", Login).AllowAnonymous();
        grp.MapPost("/refresh", Refresh).AllowAnonymous();
        grp.MapPost("/logout", Logout).RequireAuthorization();
        grp.MapGet("/me", Me).RequireAuthorization();
        grp.MapPost("/switch-tenant/{tenantId:guid}", SwitchTenant).RequireAuthorization();
    }

    static async Task<Results<Ok<AuthResponse>, ValidationProblem, Conflict<string>>> Signup(
        SignupRequest req,
        AppDbContext db,
        IJwtTokenService jwt,
        IEmailSender email,
        CancellationToken ct)
    {
        var emailLower = req.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(u => u.Email == emailLower, ct))
            return TypedResults.Conflict("An account with that email already exists.");

        var user = new User
        {
            Email = emailLower,
            DisplayName = req.DisplayName.Trim(),
            Phone = string.IsNullOrWhiteSpace(req.Phone) ? null : req.Phone.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password, workFactor: 11),
            EmailVerified = false,
        };
        db.Users.Add(user);

        var workspaceName = !string.IsNullOrWhiteSpace(req.WorkspaceName)
            ? req.WorkspaceName.Trim()
            : $"{user.DisplayName.Split(' ')[0]}'s Workspace";

        var tenant = new Tenant
        {
            Name = workspaceName,
            Slug = SlugFromName(workspaceName, suffix: Guid.NewGuid().ToString("N")[..6]),
            Plan = TenantPlan.Free,
        };
        db.Tenants.Add(tenant);

        var membership = new TenantMembership
        {
            TenantId = tenant.Id,
            UserId = user.Id,
            Role = "Admin",
            IsOwner = true,   // First admin = workspace owner, immutable
        };
        db.Memberships.Add(membership);

        // Seed a starter category + asset type so the new tenant isn't empty.
        var generalCat = new AssetCategory { TenantId = tenant.Id, Name = "General" };
        db.Categories.Add(generalCat);
        db.AssetTypes.Add(new AssetType
        {
            TenantId = tenant.Id,
            CategoryId = generalCat.Id,
            Name = "Generic Asset",
            FieldSchema = System.Text.Json.JsonDocument.Parse("[]"),
        });

        await db.SaveChangesAsync(ct);

        // Fire-and-forget welcome email
        _ = email.SendAsync(
            user.Email,
            "Welcome to AssetHub",
            $"<p>Hi {WebUtilHtmlEncode(user.DisplayName)},</p>" +
            $"<p>Your workspace <b>{WebUtilHtmlEncode(tenant.Name)}</b> is ready.</p>" +
            "<p>Sign in and start adding assets.</p>");

        return TypedResults.Ok(await BuildAuthResponse(db, jwt, user, tenant.Id, ct));
    }

    static async Task<Results<Ok<AuthResponse>, UnauthorizedHttpResult>> Login(
        LoginRequest req,
        AppDbContext db,
        IJwtTokenService jwt,
        CancellationToken ct)
    {
        var emailLower = req.Email.Trim().ToLowerInvariant();
        var user = await db.Users
            .Include(u => u.Memberships).ThenInclude(m => m.Tenant)
            .FirstOrDefaultAsync(u => u.Email == emailLower, ct);

        if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            return TypedResults.Unauthorized();

        if (!user.Memberships.Any())
            return TypedResults.Unauthorized();

        var activeTenantId = req.TenantId is { } tid &&
                             user.Memberships.Any(m => m.TenantId == tid)
            ? tid
            : user.Memberships.First().TenantId;

        user.LastLoginAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(await BuildAuthResponse(db, jwt, user, activeTenantId, ct));
    }

    static async Task<Results<Ok<AuthResponse>, UnauthorizedHttpResult>> Refresh(
        RefreshRequest req,
        AppDbContext db,
        IJwtTokenService jwt,
        CancellationToken ct)
    {
        var hash = jwt.HashToken(req.RefreshToken);
        var token = await db.RefreshTokens
            .Include(r => r.User).ThenInclude(u => u.Memberships).ThenInclude(m => m.Tenant)
            .FirstOrDefaultAsync(r => r.TokenHash == hash, ct);

        if (token is null || token.RevokedAt is not null || token.ExpiresAt < DateTimeOffset.UtcNow)
            return TypedResults.Unauthorized();

        // Rotate: revoke old, issue new
        token.RevokedAt = DateTimeOffset.UtcNow;
        var activeTenantId = token.User.Memberships.First().TenantId;
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(await BuildAuthResponse(db, jwt, token.User, activeTenantId, ct));
    }

    static async Task<Ok> Logout(RefreshRequest req, AppDbContext db, IJwtTokenService jwt, CancellationToken ct)
    {
        var hash = jwt.HashToken(req.RefreshToken);
        var token = await db.RefreshTokens.FirstOrDefaultAsync(r => r.TokenHash == hash, ct);
        if (token is not null && token.RevokedAt is null)
        {
            token.RevokedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
        }
        return TypedResults.Ok();
    }

    static async Task<Results<Ok<AuthResponse>, UnauthorizedHttpResult>> Me(
        ICurrentUser current, AppDbContext db, IJwtTokenService jwt, CancellationToken ct)
    {
        if (current.UserId is not Guid uid || current.TenantId is not Guid tid)
            return TypedResults.Unauthorized();

        var user = await db.Users
            .Include(u => u.Memberships).ThenInclude(m => m.Tenant)
            .FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user is null) return TypedResults.Unauthorized();

        return TypedResults.Ok(await BuildAuthResponse(db, jwt, user, tid, ct, includeNewRefresh: false));
    }

    static async Task<Results<Ok<AuthResponse>, UnauthorizedHttpResult, NotFound>> SwitchTenant(
        Guid tenantId, ICurrentUser current, AppDbContext db, IJwtTokenService jwt, CancellationToken ct)
    {
        if (current.UserId is not Guid uid) return TypedResults.Unauthorized();

        var user = await db.Users
            .Include(u => u.Memberships).ThenInclude(m => m.Tenant)
            .FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user is null) return TypedResults.Unauthorized();
        if (!user.Memberships.Any(m => m.TenantId == tenantId)) return TypedResults.NotFound();

        return TypedResults.Ok(await BuildAuthResponse(db, jwt, user, tenantId, ct));
    }

    // ── Helpers ───────────────────────────────────────────────────────

    static async Task<AuthResponse> BuildAuthResponse(
        AppDbContext db, IJwtTokenService jwt, User user, Guid activeTenantId,
        CancellationToken ct, bool includeNewRefresh = true)
    {
        var membership = user.Memberships.First(m => m.TenantId == activeTenantId);
        var permissions = Perms.Effective(membership);
        var (access, exp) = jwt.IssueAccessToken(user, activeTenantId, membership.Role, permissions, membership.IsOwner);

        string refreshTokenPlain = "";
        if (includeNewRefresh)
        {
            var (plain, hash, refreshExp) = jwt.IssueRefreshToken();
            db.RefreshTokens.Add(new RefreshToken
            {
                UserId = user.Id,
                TokenHash = hash,
                ExpiresAt = refreshExp,
            });
            await db.SaveChangesAsync(ct);
            refreshTokenPlain = plain;
        }

        var tenants = user.Memberships.Select(m => new TenantDto(
            m.TenantId, m.Tenant.Name, m.Tenant.Slug, m.Role, m.Tenant.Plan.ToString(),
            m.IsOwner, Perms.Effective(m))).ToList();
        var active = tenants.First(t => t.Id == activeTenantId);

        return new AuthResponse(
            AccessToken: access,
            RefreshToken: refreshTokenPlain,
            ExpiresAt: exp,
            User: new UserDto(user.Id, user.Email, user.DisplayName, user.Phone),
            ActiveTenant: active,
            Tenants: tenants);
    }

    static string SlugFromName(string name, string suffix)
    {
        var slug = new string(name.ToLowerInvariant()
            .Select(c => char.IsLetterOrDigit(c) ? c : '-').ToArray());
        slug = string.Join('-', slug.Split('-', StringSplitOptions.RemoveEmptyEntries));
        return $"{slug}-{suffix}".Trim('-');
    }

    static string WebUtilHtmlEncode(string s) => System.Net.WebUtility.HtmlEncode(s);
}
