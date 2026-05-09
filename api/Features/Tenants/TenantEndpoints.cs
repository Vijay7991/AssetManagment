using AssetHub.Api.Domain;
using AssetHub.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;

namespace AssetHub.Api.Features.Tenants;

public record InviteRequest(string Email, string Role);
public record AcceptInviteRequest(string Token, string Password, string DisplayName);
public record MemberDto(Guid UserId, string Email, string DisplayName, string Role, DateTimeOffset JoinedAt);
public record InviteDto(Guid Id, string Email, string Role, DateTimeOffset ExpiresAt, bool Accepted);

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

    static async Task<Ok<List<InviteDto>>> ListInvites(ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        var list = await db.Invites
            .Where(i => i.TenantId == cu.TenantId)
            .OrderByDescending(i => i.CreatedAt)
            .Select(i => new InviteDto(i.Id, i.Email, i.Role, i.ExpiresAt, i.AcceptedAt != null))
            .ToListAsync(ct);
        return TypedResults.Ok(list);
    }

    static async Task<Results<Ok<InviteDto>, ForbidHttpResult>> CreateInvite(
        InviteRequest req, ICurrentUser cu, AppDbContext db, IEmailSender mail,
        HttpRequest http, CancellationToken ct)
    {
        if (!cu.HasRole("Admin")) return TypedResults.Forbid();
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
        var invite = new TenantInvite
        {
            TenantId = cu.TenantId!.Value,
            Email = req.Email.Trim().ToLowerInvariant(),
            Role = NormalizeRole(req.Role),
            Token = token,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(7),
            CreatedBy = cu.UserId!.Value,
        };
        db.Invites.Add(invite);
        await db.SaveChangesAsync(ct);

        var link = $"{http.Scheme}://{http.Host}/invite/{token}";
        _ = mail.SendAsync(invite.Email,
            "You've been invited to AssetHub",
            $"<p>You've been invited to join an AssetHub workspace.</p>" +
            $"<p><a href=\"{link}\">Accept invite</a></p>" +
            $"<p>This link expires in 7 days.</p>");

        return TypedResults.Ok(new InviteDto(invite.Id, invite.Email, invite.Role, invite.ExpiresAt, false));
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
}
