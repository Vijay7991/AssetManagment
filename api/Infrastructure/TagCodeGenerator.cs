using System.Security.Cryptography;

namespace AssetHub.Api.Infrastructure;

/// <summary>
/// Generates short opaque codes for asset tags.
/// 10 chars from a 32-char alphabet → 32^10 = 1.1 × 10^15 possibilities.
/// Crockford base32 (no I/L/O/U) avoids visual confusion when read off a label.
/// </summary>
public static class TagCodeGenerator
{
    private const string Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    public const int Length = 10;

    public static string Generate()
    {
        var sb = new char[Length];
        Span<byte> bytes = stackalloc byte[Length];
        RandomNumberGenerator.Fill(bytes);
        for (int i = 0; i < Length; i++)
            sb[i] = Alphabet[bytes[i] % Alphabet.Length];
        return new string(sb);
    }
}
