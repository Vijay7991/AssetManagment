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
    (string AccessToken, DateTimeOffset ExpiresAt) IssueAccessToken(User user, Guid tenantId, string role);
    (string PlainToken, string TokenHash, DateTimeOffset ExpiresAt) IssueRefreshToken();
    string HashToken(string plain);
}

public class JwtTokenService : IJwtTokenService
{
    private readonly JwtOptions _opts;
    public JwtTokenService(JwtOptions opts) => _opts = opts;

    public (string, DateTimeOffset) IssueAccessToken(User user, Guid tenantId, string role)
    {
        var expires = DateTimeOffset.UtcNow.AddMinutes(_opts.AccessTtlMinutes);
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Name, user.DisplayName),
            new(ClaimTypes.Role, role),
            new("tid", tenantId.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_opts.Secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var jwt = new JwtSecurityToken(
            issuer: _opts.Issuer,
            audience: _opts.Audience,
            claims: claims,
            expires: expires.UtcDateTime,
            signingCredentials: creds);

        return (new JwtSecurityTokenHandler().WriteToken(jwt), expires);
    }

    public (string, string, DateTimeOffset) IssueRefreshToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(48);
        var plain = Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');
        var hash = HashToken(plain);
        var expires = DateTimeOffset.UtcNow.AddDays(_opts.RefreshTtlDays);
        return (plain, hash, expires);
    }

    public string HashToken(string plain)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(plain));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
