using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using AssetHub.Api.Domain;
using Microsoft.IdentityModel.Tokens;

namespace AssetHub.Api.Infrastructure;

public class JwtOptions
{
    public string Secret { get; set; } = "";
    public string Issuer { get; set; } = "assethub";
    public string Audience { get; set; } = "assethub-clients";
    public int AccessTtlMinutes { get; set; } = 60;
    public int RefreshTtlDays { get; set; } = 30;
}

public interface IJwtTokenService
{
    (string AccessToken, DateTimeOffset ExpiresAt) IssueAccessToken(
        User user, Guid tenantId, string role, IEnumerable<string> permissions, bool isOwner);
    (string PlainToken, string TokenHash, DateTimeOffset ExpiresAt) IssueRefreshToken();
    string HashToken(string plain);

    /// One-time password-reset tokens use the same hashing strategy as refresh
    /// tokens but live in their own table. Returns a URL-safe plain token (sent
    /// in the email) and the hash (stored in DB).
    (string PlainToken, string TokenHash, DateTimeOffset ExpiresAt) IssuePasswordResetToken();
}

public class JwtTokenService : IJwtTokenService
{
    private readonly JwtOptions _opts;
    public JwtTokenService(JwtOptions opts) => _opts = opts;

    public (string, DateTimeOffset) IssueAccessToken(
        User user, Guid tenantId, string role, IEnumerable<string> permissions, bool isOwner)
    {
        var expires = DateTimeOffset.UtcNow.AddMinutes(_opts.AccessTtlMinutes);
        var permsCsv = string.Join(",", permissions ?? Array.Empty<string>());

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new("name", user.DisplayName),
            new("role", role),
            new("tenant_id", tenantId.ToString()),
            new("tid", tenantId.ToString()),
            new("perms", permsCsv),
            new("owner", isOwner ? "true" : "false"),
            new("root", user.IsRootAdmin ? "true" : "false"),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_opts.Secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        // Disable outbound claim-type mapping so what we put in is what comes out.
        var handler = new JwtSecurityTokenHandler();
        handler.OutboundClaimTypeMap.Clear();

        var jwt = new JwtSecurityToken(
            issuer: _opts.Issuer,
            audience: _opts.Audience,
            claims: claims,
            expires: expires.UtcDateTime,
            signingCredentials: creds);

        return (handler.WriteToken(jwt), expires);
    }

    public (string, string, DateTimeOffset) IssueRefreshToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(48);
        var plain = Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');
        var hash = HashToken(plain);
        var expires = DateTimeOffset.UtcNow.AddDays(_opts.RefreshTtlDays);
        return (plain, hash, expires);
    }

    public (string, string, DateTimeOffset) IssuePasswordResetToken()
    {
        // 24 random bytes → 32-char base64url string. Short enough to fit a URL,
        // long enough that brute-forcing within 1h is wildly impractical.
        var bytes = RandomNumberGenerator.GetBytes(24);
        var plain = Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');
        var hash = HashToken(plain);
        // 1-hour expiry — long enough the user can read the email and click, short
        // enough that a stolen mailbox snapshot from yesterday is worthless.
        var expires = DateTimeOffset.UtcNow.AddHours(1);
        return (plain, hash, expires);
    }

    public string HashToken(string plain)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(plain));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
