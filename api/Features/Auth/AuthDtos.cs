using System.ComponentModel.DataAnnotations;

namespace AssetHub.Api.Features.Auth;

public record SignupRequest(
    [Required, EmailAddress, MaxLength(180)] string Email,
    [Required, MinLength(8), MaxLength(120)] string Password,
    [Required, MaxLength(120)] string DisplayName,
    [MaxLength(20)] string? Phone,
    [MaxLength(120)] string? WorkspaceName);

public record LoginRequest(
    [Required, EmailAddress] string Email,
    [Required] string Password,
    Guid? TenantId);

public record RefreshRequest(string RefreshToken);

public record AuthResponse(
    string AccessToken,
    string RefreshToken,
    DateTimeOffset ExpiresAt,
    UserDto User,
    TenantDto ActiveTenant,
    IReadOnlyList<TenantDto> Tenants);

public record UserDto(Guid Id, string Email, string DisplayName, string? Phone, bool IsRootAdmin = false);

public record ForgotPasswordRequest(
    [Required, EmailAddress] string Email);

public record ResetPasswordRequest(
    [Required] string Token,
    [Required, MinLength(8), MaxLength(120)] string Password);

public record ChangePasswordRequest(
    [Required] string CurrentPassword,
    [Required, MinLength(8), MaxLength(120)] string NewPassword);

public record TenantDto(
    Guid Id, string Name, string Slug, string Role, string Plan,
    bool IsOwner, IReadOnlyList<string> Permissions);

public record InviteCreateRequest(
    [Required, EmailAddress] string Email,
    [Required] string Role);

public record AcceptInviteRequest(
    [Required] string Token,
    [MinLength(8)] string? Password,
    [MaxLength(120)] string? DisplayName);
