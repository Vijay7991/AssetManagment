using AssetHub.Api.Domain;
using AssetHub.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;

namespace AssetHub.Api.Features.Tenants;

public record InviteRequest(string Email, string Role, string? Phone, string? Channel);
public record AcceptInviteRequest(string Token, string Password, string DisplayName);
public record MemberDto(
    Guid UserId, string Email, string DisplayName, string Role,
    bool IsOwner, bool IsActive, IReadOnlyList<string> Permissions, IReadOnlyList<string> ExtraPermissions,
    DateTimeOffset JoinedAt,
    // IsRootAdmin lets the members UI hide reset/role/remove buttons for the
    // root admin row. Server-side guards still enforce it; this is purely UI.
    bool IsRootAdmin);
public record UpdateRoleRequest(string Role);
public record UpdatePermissionsRequest(IReadOnlyList<string> ExtraPermissions);
public record UpdateActiveRequest(bool IsActive);
public record AdminResetResponse(string ResetLink, DateTimeOffset ExpiresAt);
public record InviteDto(
    Guid Id,
    string Email,
    string? Phone,
    string Role,
    DateTimeOffset ExpiresAt,
    bool Accepted,
    string InviteLink,
    string? WhatsAppLink);

public static class TenantEndpoints
{
    public static void MapTenantEndpoints(this IEndpointRouteBuilder app)
    {
        var grp = app.MapGroup("/api/tenant").RequireAuthorization().WithTags("Tenant");
        grp.MapGet("/members", ListMembers);
        grp.MapPut("/members/{userId:guid}/role", UpdateRole);
        grp.MapPut("/members/{userId:guid}/permissions", UpdatePermissions);
        grp.MapPut("/members/{userId:guid}/active", UpdateActive);
        grp.MapPost("/members/{userId:guid}/reset-password", AdminResetPassword);
        grp.MapDelete("/members/{userId:guid}", RemoveMember);
        grp.MapGet("/invites", ListInvites);
        grp.MapPost("/invites", CreateInvite);
        grp.MapDelete("/invites/{id:guid}", RevokeInvite);

        // Public invite-acceptance flow (anonymous)
        app.MapPost("/api/invites/accept", AcceptInvite).AllowAnonymous().WithTags("Invites");
        app.MapGet("/api/invites/preview/{token}", PreviewInvite).AllowAnonymous().WithTags("Invites");
    }

    static async Task<Ok<List<MemberDto>>> ListMembers(
        ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        var rows = await db.Memberships
            .Include(m => m.User)
            .Where(m => m.TenantId == cu.TenantId)
            .OrderByDescending(m => m.IsOwner)
            .ThenBy(m => m.User.DisplayName)
            .ToListAsync(ct);

        var list = rows.Select(m => new MemberDto(
            m.User.Id, m.User.Email, m.User.DisplayName, m.Role,
            m.IsOwner, m.User.IsActive,
            Perms.Effective(m),
            Perms.ParseExtras(m.ExtraPermissions),
            m.CreatedAt,
            m.User.IsRootAdmin
        )).ToList();
        return TypedResults.Ok(list);
    }

    static async Task<Results<NoContent, NotFound, ForbidHttpResult, BadRequest<string>>> UpdateRole(
        Guid userId, UpdateRoleRequest req, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.Can(Perms.MembersWrite)) return TypedResults.Forbid();
        var m = await db.Memberships
            .Include(x => x.User)
            .FirstOrDefaultAsync(x => x.TenantId == cu.TenantId && x.UserId == userId, ct);
        if (m is null) return TypedResults.NotFound();

        // Tenant Admins must not be able to change the role of the root admin.
        if (m.User.IsRootAdmin && !cu.IsRootAdmin) return TypedResults.Forbid();

        var newRole = NormalizeRole(req.Role);

        // The workspace owner is always Admin and cannot be demoted.
        if (m.IsOwner && newRole != "Admin")
            return TypedResults.BadRequest("The workspace owner must remain an Admin.");

        // Cannot demote the last Admin.
        if (m.Role == "Admin" && newRole != "Admin")
        {
            var adminCount = await db.Memberships
                .CountAsync(x => x.TenantId == cu.TenantId && x.Role == "Admin", ct);
            if (adminCount <= 1)
                return TypedResults.BadRequest("Cannot demote the last Admin. Promote someone else first.");
        }

        m.Role = newRole;
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    static async Task<Results<Ok<MemberDto>, NotFound, ForbidHttpResult, BadRequest<string>>> UpdatePermissions(
        Guid userId, UpdatePermissionsRequest req, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.Can(Perms.MembersWrite)) return TypedResults.Forbid();
        var m = await db.Memberships
            .Include(x => x.User)
            .FirstOrDefaultAsync(x => x.TenantId == cu.TenantId && x.UserId == userId, ct);
        if (m is null) return TypedResults.NotFound();

        // Root admin permissions can't be edited by tenant admins.
        if (m.User.IsRootAdmin && !cu.IsRootAdmin) return TypedResults.Forbid();

        // Reject unknown permissions to keep the data clean.
        var unknown = (req.ExtraPermissions ?? Array.Empty<string>())
            .Where(p => !string.IsNullOrWhiteSpace(p) && !Perms.IsKnownPermission(p))
            .ToArray();
        if (unknown.Length > 0)
            return TypedResults.BadRequest($"Unknown permission(s): {string.Join(", ", unknown)}");

        m.ExtraPermissions = Perms.SerializeExtras(req.ExtraPermissions);
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(new MemberDto(
            m.User.Id, m.User.Email, m.User.DisplayName, m.Role,
            m.IsOwner, m.User.IsActive,
            Perms.Effective(m),
            Perms.ParseExtras(m.ExtraPermissions),
            m.CreatedAt,
            m.User.IsRootAdmin));
    }

    static async Task<Results<NoContent, NotFound, ForbidHttpResult, BadRequest<string>>> UpdateActive(
        Guid userId, UpdateActiveRequest req, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.Can(Perms.MembersWrite)) return TypedResults.Forbid();
        if (userId == cu.UserId) return TypedResults.BadRequest("You cannot deactivate yourself.");

        var m = await db.Memberships
            .Include(x => x.User)
            .FirstOrDefaultAsync(x => x.TenantId == cu.TenantId && x.UserId == userId, ct);
        if (m is null) return TypedResults.NotFound();

        // Tenant admins must not be able to deactivate the root admin —
        // doing so would lock the platform owner out of every workspace.
        if (m.User.IsRootAdmin && !cu.IsRootAdmin) return TypedResults.Forbid();

        // Owners are protected from being switched off — they'd lock themselves
        // out of the workspace they created. Use a different tenant admin instead.
        if (m.IsOwner && !req.IsActive)
            return TypedResults.BadRequest("The workspace owner cannot be deactivated.");

        if (m.User.IsActive == req.IsActive) return TypedResults.NoContent();

        m.User.IsActive = req.IsActive;
        m.User.DeactivatedAt = req.IsActive ? null : DateTimeOffset.UtcNow;

        // When deactivating, revoke active sessions so the user is signed out
        // everywhere immediately. When reactivating, leave the (already expired)
        // tokens alone — they'll just fail to refresh.
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

    static async Task<Results<Ok<AdminResetResponse>, NotFound, ForbidHttpResult>> AdminResetPassword(
        Guid userId, ICurrentUser cu, AppDbContext db, IJwtTokenService jwt,
        IEmailSender mail, HttpRequest http, CancellationToken ct)
    {
        if (!cu.Can(Perms.MembersWrite)) return TypedResults.Forbid();

        var m = await db.Memberships
            .Include(x => x.User)
            .Include(x => x.Tenant)
            .FirstOrDefaultAsync(x => x.TenantId == cu.TenantId && x.UserId == userId, ct);
        if (m is null) return TypedResults.NotFound();

        // Root admin is platform-level, not tenant-level. A tenant Admin must
        // not be able to reset the root admin's password — that would let them
        // hijack the platform owner account. Only another root admin (acting
        // through the /api/root endpoints, not /api/tenant) can do that.
        if (m.User.IsRootAdmin && !cu.IsRootAdmin) return TypedResults.Forbid();

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

        _ = mail.SendAsync(m.User.Email,
            $"Password reset for {m.Tenant.Name}",
            EmailTemplates.AdminPasswordReset(m.User.DisplayName, m.Tenant.Name, link));

        // We hand the link back to the admin too — handy when MailHog isn't being
        // watched, or for closed/offline environments where the user is sitting
        // next to the admin.
        return TypedResults.Ok(new AdminResetResponse(link, expires));
    }

    static async Task<Results<NoContent, NotFound, ForbidHttpResult, BadRequest<string>>> RemoveMember(
        Guid userId, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.Can(Perms.MembersWrite)) return TypedResults.Forbid();
        if (userId == cu.UserId) return TypedResults.BadRequest("You cannot remove yourself.");

        var m = await db.Memberships
            .Include(x => x.User)
            .FirstOrDefaultAsync(x => x.TenantId == cu.TenantId && x.UserId == userId, ct);
        if (m is null) return TypedResults.NotFound();

        // Tenant admins cannot evict the root admin from a workspace.
        if (m.User.IsRootAdmin && !cu.IsRootAdmin) return TypedResults.Forbid();

        if (m.IsOwner)
            return TypedResults.BadRequest("The workspace owner cannot be removed.");

        if (m.Role == "Admin")
        {
            var adminCount = await db.Memberships
                .CountAsync(x => x.TenantId == cu.TenantId && x.Role == "Admin", ct);
            if (adminCount <= 1)
                return TypedResults.BadRequest("Cannot remove the last Admin.");
        }

        db.Memberships.Remove(m);
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    static async Task<Ok<List<InviteDto>>> ListInvites(
        ICurrentUser cu, AppDbContext db, HttpRequest http, CancellationToken ct)
    {
        var list = await db.Invites
            .Include(i => i.Tenant)
            .Where(i => i.TenantId == cu.TenantId)
            .OrderByDescending(i => i.CreatedAt)
            .ToListAsync(ct);

        var baseUrl = $"{http.Scheme}://{http.Host}";
        return TypedResults.Ok(list.Select(i => MapInviteDto(i, baseUrl)).ToList());
    }

    static async Task<Results<Ok<InviteDto>, ForbidHttpResult, BadRequest<string>>> CreateInvite(
        InviteRequest req, ICurrentUser cu, AppDbContext db, IEmailSender mail,
        IMailHealth mailHealth, IConfiguration config,
        HttpRequest http, CancellationToken ct)
    {
        if (!cu.HasRole("Admin")) return TypedResults.Forbid();

        var emailLower = req.Email.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(emailLower))
            return TypedResults.BadRequest("Email is required.");

        // Channel: "Email" (default), "WhatsApp", or anything else custom.
        var channel = string.IsNullOrWhiteSpace(req.Channel) ? "Email" : req.Channel.Trim();
        var phone = NormalizePhone(req.Phone);
        var isWhatsApp = channel.Equals("WhatsApp", StringComparison.OrdinalIgnoreCase);
        var isEmail = !isWhatsApp;

        if (isWhatsApp && string.IsNullOrEmpty(phone))
            return TypedResults.BadRequest("Phone number is required for WhatsApp invites.");

        // ── Restriction checks ────────────────────────────────────────────

        // 1. The platform-level root admin is special and lives outside the
        //    multi-tenant model. Refuse to invite that email into a workspace.
        var rootEmail = config["RootAdmin:Email"]?.Trim().ToLowerInvariant();
        if (!string.IsNullOrEmpty(rootEmail) && rootEmail == emailLower)
            return TypedResults.BadRequest(
                "This email is reserved for the platform root admin and cannot be invited to a workspace.");

        // 2. Already a member of THIS tenant? They don't need an invite.
        var existingMember = await db.Memberships
            .Include(m => m.User)
            .FirstOrDefaultAsync(m => m.TenantId == cu.TenantId && m.User.Email == emailLower, ct);
        if (existingMember is not null)
            return TypedResults.BadRequest($"{emailLower} is already a member of this workspace.");

        // 3. Email already exists anywhere in the system — per policy, accounts
        //    are one-per-email and can't be invited a second time even into a
        //    different workspace. The original admin can re-issue access through
        //    their workspace if needed.
        if (await db.Users.AnyAsync(u => u.Email == emailLower, ct))
            return TypedResults.BadRequest(
                "An account with this email already exists. Ask them to sign in and join a workspace from there.");

        // 4. A pending unaccepted invite to this tenant already exists — refuse
        //    to issue a duplicate so we don't spam the recipient with two links.
        if (await db.Invites.AnyAsync(i =>
                i.TenantId == cu.TenantId && i.Email == emailLower &&
                i.AcceptedAt == null && i.ExpiresAt > DateTimeOffset.UtcNow, ct))
            return TypedResults.BadRequest(
                "A pending invite for this email already exists. Revoke it first or wait for it to expire.");

        // 5. Email channel selected but the mail server isn't reachable — refuse
        //    rather than silently dropping the message. The UI hides this option
        //    when mail is down; this is the server-side seatbelt.
        if (isEmail)
        {
            var health = await mailHealth.GetAsync(ct);
            if (!health.Enabled)
                return TypedResults.BadRequest(
                    "Email delivery is currently unavailable on this server. Send the invite via WhatsApp instead.");
        }

        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
        var tenant = await db.Tenants.FirstAsync(t => t.Id == cu.TenantId!.Value, ct);

        var invite = new TenantInvite
        {
            TenantId = cu.TenantId!.Value,
            Tenant = tenant,
            Email = emailLower,
            Phone = phone,
            Channel = channel,
            Role = NormalizeRole(req.Role),
            Token = token,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(7),
            CreatedBy = cu.UserId!.Value,
        };
        db.Invites.Add(invite);
        await db.SaveChangesAsync(ct);

        var baseUrl = $"{http.Scheme}://{http.Host}";

        // Only send the email copy when the chosen channel is Email — for the
        // WhatsApp flow the admin will share the link directly, no SMTP needed.
        if (isEmail)
        {
            var link = $"{baseUrl}/invite/{token}";
            _ = mail.SendAsync(invite.Email,
                $"You've been invited to {tenant.Name}",
                EmailTemplates.WorkspaceInvite(tenant.Name, invite.Role, link));
        }

        return TypedResults.Ok(MapInviteDto(invite, baseUrl));
    }

    static async Task<Results<NoContent, NotFound, ForbidHttpResult>> RevokeInvite(
        Guid id, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.HasRole("Admin")) return TypedResults.Forbid();
        var i = await db.Invites.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == cu.TenantId, ct);
        if (i is null) return TypedResults.NotFound();
        db.Invites.Remove(i);
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    static async Task<Results<Ok<object>, NotFound>> PreviewInvite(
        string token, AppDbContext db, CancellationToken ct)
    {
        var invite = await db.Invites
            .Include(i => i.Tenant)
            .FirstOrDefaultAsync(i => i.Token == token, ct);
        if (invite is null || invite.AcceptedAt is not null || invite.ExpiresAt < DateTimeOffset.UtcNow)
            return TypedResults.NotFound();

        return TypedResults.Ok<object>(new
        {
            tenantName = invite.Tenant.Name,
            email = invite.Email,
            role = invite.Role,
        });
    }

    static async Task<Results<Ok, NotFound, BadRequest<string>>> AcceptInvite(
        AcceptInviteRequest req, AppDbContext db, CancellationToken ct)
    {
        var invite = await db.Invites.FirstOrDefaultAsync(i => i.Token == req.Token, ct);
        if (invite is null || invite.AcceptedAt is not null || invite.ExpiresAt < DateTimeOffset.UtcNow)
            return TypedResults.NotFound();

        // Find existing user or create new one
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == invite.Email, ct);
        if (user is null)
        {
            if (string.IsNullOrEmpty(req.Password) || req.Password.Length < 8)
                return TypedResults.BadRequest("Password is required (min 8 chars).");
            user = new User
            {
                Email = invite.Email,
                DisplayName = string.IsNullOrWhiteSpace(req.DisplayName) ? invite.Email : req.DisplayName,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password, 11),
            };
            db.Users.Add(user);
        }

        if (!await db.Memberships.AnyAsync(m => m.TenantId == invite.TenantId && m.UserId == user.Id, ct))
        {
            db.Memberships.Add(new TenantMembership
            {
                TenantId = invite.TenantId,
                UserId = user.Id,
                Role = invite.Role,
            });
        }

        invite.AcceptedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok();
    }

    static string NormalizeRole(string role) => role.ToLowerInvariant() switch
    {
        "admin"   => "Admin",
        "manager" => "Manager",
        _         => "Member",
    };

    /// <summary>
    /// Strip everything but digits, optionally keep leading +. We don't validate
    /// against any country list — caller is responsible for picking a real number.
    /// Returns null for empty/invalid input.
    /// </summary>
    static string? NormalizePhone(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var trimmed = raw.Trim();
        var digits = new string(trimmed.Where(char.IsDigit).ToArray());
        if (digits.Length < 7 || digits.Length > 15) return null;  // E.164 bounds
        return digits;  // wa.me wants digits only, no +
    }

    static InviteDto MapInviteDto(TenantInvite i, string baseUrl)
    {
        var inviteLink = $"{baseUrl}/invite/{i.Token}";
        string? whatsAppLink = null;
        if (!string.IsNullOrEmpty(i.Phone))
        {
            // wa.me opens WhatsApp with a pre-filled message. The user taps Send.
            // No API key, no business account needed.
            var msg = Uri.EscapeDataString(
                $"You're invited to join {i.Tenant?.Name ?? "AssetHub"} on AssetHub. " +
                $"Accept here: {inviteLink}");
            whatsAppLink = $"https://wa.me/{i.Phone}?text={msg}";
        }
        return new InviteDto(
            i.Id, i.Email, i.Phone, i.Role, i.ExpiresAt,
            i.AcceptedAt != null, inviteLink, whatsAppLink);
    }
}
