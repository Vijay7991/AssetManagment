using AssetHub.Api.Domain;
using AssetHub.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;

namespace AssetHub.Api.Features.Tenants;

public record InviteRequest(string Email, string Role, string? Phone, string? Channel);
public record AcceptInviteRequest(string Token, string Password, string DisplayName);
public record MemberDto(Guid UserId, string Email, string DisplayName, string Role, DateTimeOffset JoinedAt);
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
        var list = await db.Memberships
            .Include(m => m.User)
            .Where(m => m.TenantId == cu.TenantId)
            .OrderBy(m => m.User.DisplayName)
            .Select(m => new MemberDto(m.User.Id, m.User.Email, m.User.DisplayName, m.Role, m.CreatedAt))
            .ToListAsync(ct);
        return TypedResults.Ok(list);
    }

    static async Task<Results<NoContent, NotFound, ForbidHttpResult>> UpdateRole(
        Guid userId, InviteRequest req, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.HasRole("Admin")) return TypedResults.Forbid();
        var m = await db.Memberships.FirstOrDefaultAsync(x => x.TenantId == cu.TenantId && x.UserId == userId, ct);
        if (m is null) return TypedResults.NotFound();
        m.Role = NormalizeRole(req.Role);
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    static async Task<Results<NoContent, NotFound, ForbidHttpResult, BadRequest<string>>> RemoveMember(
        Guid userId, ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        if (!cu.HasRole("Admin")) return TypedResults.Forbid();
        if (userId == cu.UserId) return TypedResults.BadRequest("You cannot remove yourself.");
        var m = await db.Memberships.FirstOrDefaultAsync(x => x.TenantId == cu.TenantId && x.UserId == userId, ct);
        if (m is null) return TypedResults.NotFound();
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
        HttpRequest http, CancellationToken ct)
    {
        if (!cu.HasRole("Admin")) return TypedResults.Forbid();

        // Channel: "Email" (default), "WhatsApp", or anything else custom.
        var channel = string.IsNullOrWhiteSpace(req.Channel) ? "Email" : req.Channel.Trim();
        var phone = NormalizePhone(req.Phone);

        if (channel.Equals("WhatsApp", StringComparison.OrdinalIgnoreCase) && string.IsNullOrEmpty(phone))
            return TypedResults.BadRequest("Phone number is required for WhatsApp invites.");

        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
        var tenant = await db.Tenants.FirstAsync(t => t.Id == cu.TenantId!.Value, ct);

        var invite = new TenantInvite
        {
            TenantId = cu.TenantId!.Value,
            Tenant = tenant,
            Email = req.Email.Trim().ToLowerInvariant(),
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

        // Always send the email copy if we have an email — cheap insurance.
        if (!channel.Equals("WhatsApp", StringComparison.OrdinalIgnoreCase) ||
            (!string.IsNullOrEmpty(invite.Email) && channel.Equals("WhatsApp", StringComparison.OrdinalIgnoreCase) == false))
        {
            var link = $"{baseUrl}/invite/{token}";
            _ = mail.SendAsync(invite.Email,
                $"You've been invited to {tenant.Name}",
                $"<p>You've been invited to join the AssetHub workspace <b>{System.Net.WebUtility.HtmlEncode(tenant.Name)}</b>.</p>" +
                $"<p><a href=\"{link}\">Accept invite</a></p>" +
                $"<p>This link expires in 7 days.</p>");
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
