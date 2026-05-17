using AssetHub.Api.Domain;
using AssetHub.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Features.Auth;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var grp = app.MapGroup("/api/auth").WithTags("Auth");

        grp.MapPost("/signup", Signup).AllowAnonymous().RequireRateLimiting("auth-credentials");
        grp.MapPost("/login", Login).AllowAnonymous().RequireRateLimiting("auth-credentials");
        grp.MapPost("/refresh", Refresh).AllowAnonymous().RequireRateLimiting("auth-refresh");
        grp.MapPost("/logout", Logout).RequireAuthorization();
        grp.MapGet("/me", Me).RequireAuthorization();
        grp.MapPost("/switch-tenant/{tenantId:guid}", SwitchTenant).RequireAuthorization();
        grp.MapPost("/forgot-password", ForgotPassword).AllowAnonymous();
        grp.MapPost("/reset-password", ResetPassword).AllowAnonymous();
        grp.MapPost("/change-password", ChangePassword).RequireAuthorization();
    }

    static async Task<Results<Ok<AuthResponse>, ValidationProblem, Conflict<string>>> Signup(
        SignupRequest req,
        AppDbContext db,
        IJwtTokenService jwt,
        IEmailSender email,
        IConfiguration config,
        CancellationToken ct)
    {
        var emailLower = req.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(u => u.Email == emailLower, ct))
            return TypedResults.Conflict("An account with that email already exists.");

        // Refuse signup if the address has a pending invite — they should accept
        // that invite rather than create an unrelated account with the same email.
        if (await db.Invites.AnyAsync(i =>
                i.Email == emailLower && i.AcceptedAt == null && i.ExpiresAt > DateTimeOffset.UtcNow, ct))
            return TypedResults.Conflict("This email has a pending workspace invite. Accept the invite instead of signing up again.");

        // Reserve the configured root admin email. If the operator hasn't claimed
        // it yet, only that very first signup is allowed — we promote it. After
        // a root admin exists, the duplicate-email check above does the work.
        var rootEmail = config["RootAdmin:Email"]?.Trim().ToLowerInvariant();
        var isRootAdmin = !string.IsNullOrEmpty(rootEmail) && rootEmail == emailLower;

        var user = new User
        {
            Email = emailLower,
            DisplayName = req.DisplayName.Trim(),
            Phone = string.IsNullOrWhiteSpace(req.Phone) ? null : req.Phone.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password, workFactor: 11),
            EmailVerified = false,
            IsRootAdmin = isRootAdmin,
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

    static async Task<Results<Ok<AuthResponse>, UnauthorizedHttpResult, ProblemHttpResult>> Login(
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

        // Account deactivated by an admin — reject with a clearer signal than a
        // bare 401 so the UI can show the right message. The user still doesn't
        // learn anything they couldn't learn from a successful login attempt.
        if (!user.IsActive)
            return TypedResults.Problem(
                title: "Account deactivated",
                detail: "This account has been deactivated by an administrator. Contact your workspace admin to restore access.",
                statusCode: StatusCodes.Status403Forbidden);

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

        // If the user was deactivated since the token was issued, refuse to rotate
        // and revoke the token so the session terminates cleanly.
        if (!token.User.IsActive)
        {
            token.RevokedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            return TypedResults.Unauthorized();
        }

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
            User: new UserDto(user.Id, user.Email, user.DisplayName, user.Phone, user.IsRootAdmin),
            ActiveTenant: active,
            Tenants: tenants);
    }

    // ── Password reset (self-service) ─────────────────────────────────

    static async Task<Ok> ForgotPassword(
        ForgotPasswordRequest req,
        AppDbContext db,
        IJwtTokenService jwt,
        IEmailSender email,
        HttpRequest http,
        CancellationToken ct)
    {
        // We always return 200 OK regardless of whether the email exists. Anything
        // else lets an attacker enumerate which addresses have accounts.
        var emailLower = req.Email.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == emailLower, ct);

        if (user is not null && user.IsActive)
        {
            var (plain, hash, expires) = jwt.IssuePasswordResetToken();
            db.PasswordResetTokens.Add(new PasswordResetToken
            {
                UserId = user.Id,
                TokenHash = hash,
                Source = "Self",
                ExpiresAt = expires,
            });
            await db.SaveChangesAsync(ct);

            var baseUrl = $"{http.Scheme}://{http.Host}";
            var link = $"{baseUrl}/reset-password?token={plain}";
            _ = email.SendAsync(
                user.Email,
                "Reset your AssetHub password",
                $"<p>Hi {WebUtilHtmlEncode(user.DisplayName)},</p>" +
                "<p>We received a request to reset the password on your AssetHub account. " +
                "If that was you, click the link below — otherwise, ignore this email.</p>" +
                $"<p><a href=\"{link}\">Set a new password</a></p>" +
                "<p>This link expires in 1 hour.</p>");
        }

        return TypedResults.Ok();
    }

    static async Task<Results<Ok, BadRequest<string>>> ResetPassword(
        ResetPasswordRequest req,
        AppDbContext db,
        IJwtTokenService jwt,
        CancellationToken ct)
    {
        var hash = jwt.HashToken(req.Token);
        var token = await db.PasswordResetTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash == hash, ct);

        if (token is null ||
            token.ConsumedAt is not null ||
            token.ExpiresAt < DateTimeOffset.UtcNow)
        {
            return TypedResults.BadRequest("This reset link is invalid or has expired. Request a new one.");
        }

        // Admin-issued resets are allowed to land on deactivated accounts (the
        // admin may be reactivating + resetting at once), but self-service resets
        // should respect deactivation.
        if (!token.User.IsActive && token.Source == "Self")
            return TypedResults.BadRequest("This account is deactivated. Contact your administrator.");

        token.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password, workFactor: 11);
        token.ConsumedAt = DateTimeOffset.UtcNow;

        // Sign out everywhere — revoke all live refresh tokens for this user so
        // any attacker session is killed even if the user had been compromised.
        var live = await db.RefreshTokens
            .Where(r => r.UserId == token.UserId && r.RevokedAt == null)
            .ToListAsync(ct);
        foreach (var r in live) r.RevokedAt = DateTimeOffset.UtcNow;

        // Invalidate any other outstanding reset tokens for the same user.
        var other = await db.PasswordResetTokens
            .Where(t => t.UserId == token.UserId && t.Id != token.Id && t.ConsumedAt == null)
            .ToListAsync(ct);
        foreach (var t in other) t.ConsumedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return TypedResults.Ok();
    }

    static async Task<Results<Ok, UnauthorizedHttpResult, BadRequest<string>>> ChangePassword(
        ChangePasswordRequest req,
        ICurrentUser current,
        AppDbContext db,
        CancellationToken ct)
    {
        if (current.UserId is not Guid uid) return TypedResults.Unauthorized();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == uid, ct);
        if (user is null) return TypedResults.Unauthorized();

        if (!BCrypt.Net.BCrypt.Verify(req.CurrentPassword, user.PasswordHash))
            return TypedResults.BadRequest("Current password is incorrect.");

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword, workFactor: 11);
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok();
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
