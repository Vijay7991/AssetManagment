namespace AssetHub.Api.Infrastructure;

public static class PasswordPolicy
{
    public const int MinLength = 8;

    // Returns null when valid, or a human-readable error string.
    public static string? Validate(string password)
    {
        if (string.IsNullOrEmpty(password) || password.Length < MinLength)
            return $"Password must be at least {MinLength} characters.";
        if (!password.Any(char.IsUpper))
            return "Password must contain at least one uppercase letter.";
        if (!password.Any(char.IsLower))
            return "Password must contain at least one lowercase letter.";
        if (!password.Any(char.IsDigit))
            return "Password must contain at least one number.";
        if (!password.Any(c => !char.IsLetterOrDigit(c)))
            return "Password must contain at least one special character (!@#$%^&* etc.).";
        return null;
    }
}
