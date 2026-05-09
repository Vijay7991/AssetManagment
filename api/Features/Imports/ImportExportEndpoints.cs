using AssetHub.Api.Domain;
using AssetHub.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using System.Globalization;
using System.Text;
using System.Text.Json;

namespace AssetHub.Api.Features.Imports;

public record ImportResult(int Imported, int Skipped, IReadOnlyList<string> Errors);

public static class ImportExportEndpoints
{
    public static void MapImportExportEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/assets/export.csv", Export).RequireAuthorization().WithTags("Import/Export");
        app.MapPost("/api/assets/import", Import).RequireAuthorization().WithTags("Import/Export").DisableAntiforgery();
    }

    static async Task<IResult> Export(
        ICurrentUser cu, AppDbContext db, CancellationToken ct)
    {
        var assets = await db.Assets
            .Include(a => a.AssetType).ThenInclude(t => t.Category)
            .Include(a => a.Tags)
            .Where(a => a.TenantId == cu.TenantId && a.DeletedAt == null)
            .OrderBy(a => a.CreatedAt)
            .AsNoTracking()
            .ToListAsync(ct);

        var sb = new StringBuilder();
        sb.AppendLine("name,asset_type,category,status,quantity,location,description,tag_code,purchase_price,purchased_on,warranty_until,custom_fields,created_at");
        foreach (var a in assets)
        {
            var tag = a.Tags.FirstOrDefault(t => t.Status == AssetTagStatus.Active)?.Code ?? "";
            var fv = a.FieldValues?.RootElement.GetRawText() ?? "";
            sb.Append(Csv(a.Name)).Append(',')
              .Append(Csv(a.AssetType.Name)).Append(',')
              .Append(Csv(a.AssetType.Category.Name)).Append(',')
              .Append(a.Status).Append(',')
              .Append(a.Quantity).Append(',')
              .Append(Csv(a.Location ?? "")).Append(',')
              .Append(Csv(a.Description ?? "")).Append(',')
              .Append(tag).Append(',')
              .Append(a.PurchasePrice?.ToString(CultureInfo.InvariantCulture) ?? "").Append(',')
              .Append(a.PurchasedOn?.ToString("yyyy-MM-dd") ?? "").Append(',')
              .Append(a.WarrantyUntil?.ToString("yyyy-MM-dd") ?? "").Append(',')
              .Append(Csv(fv)).Append(',')
              .Append(a.CreatedAt.ToString("o"))
              .AppendLine();
        }

        var bytes = Encoding.UTF8.GetBytes(sb.ToString());
        var filename = $"assets-{DateTime.UtcNow:yyyy-MM-dd}.csv";
        return Results.File(bytes, "text/csv", filename);
    }

    static async Task<Results<Ok<ImportResult>, BadRequest<string>, ForbidHttpResult>> Import(
        IFormFile file, ICurrentUser cu, AppDbContext db,
        IAuditLogger audit, CancellationToken ct)
    {
        if (!cu.HasRole("Admin", "Manager")) return TypedResults.Forbid();
        if (file is null || file.Length == 0) return TypedResults.BadRequest("CSV file is required.");
        if (file.Length > 5 * 1024 * 1024) return TypedResults.BadRequest("CSV too large (max 5MB).");

        using var sr = new StreamReader(file.OpenReadStream(), Encoding.UTF8);
        var headerLine = await sr.ReadLineAsync(ct);
        if (headerLine is null) return TypedResults.BadRequest("CSV is empty.");
        var headers = ParseCsvLine(headerLine).Select(h => h.Trim().ToLowerInvariant()).ToList();

        int idx(string name) => headers.IndexOf(name);
        var iName = idx("name");
        var iType = idx("asset_type");
        var iCategory = idx("category");
        var iStatus = idx("status");
        var iQty = idx("quantity");
        var iLoc = idx("location");
        var iDesc = idx("description");
        var iPrice = idx("purchase_price");
        var iPurchased = idx("purchased_on");
        var iWarranty = idx("warranty_until");
        var iCustom = idx("custom_fields");

        if (iName < 0 || iType < 0)
            return TypedResults.BadRequest("CSV must have at least 'name' and 'asset_type' columns.");

        // Cache categories and types for quick lookup
        var cats = await db.Categories.Where(c => c.TenantId == cu.TenantId).ToListAsync(ct);
        var types = await db.AssetTypes.Where(t => t.TenantId == cu.TenantId).ToListAsync(ct);

        AssetCategory FindOrCreateCategory(string name)
        {
            var found = cats.FirstOrDefault(c => string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase));
            if (found is not null) return found;
            var c = new AssetCategory { TenantId = cu.TenantId!.Value, Name = name };
            db.Categories.Add(c);
            cats.Add(c);
            return c;
        }
        AssetType FindOrCreateType(string typeName, string? categoryName)
        {
            var found = types.FirstOrDefault(t => string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase));
            if (found is not null) return found;
            var cat = FindOrCreateCategory(string.IsNullOrWhiteSpace(categoryName) ? "General" : categoryName);
            var t = new AssetType
            {
                TenantId = cu.TenantId!.Value,
                CategoryId = cat.Id,
                Category = cat,
                Name = typeName,
                FieldSchema = JsonDocument.Parse("[]"),
            };
            db.AssetTypes.Add(t);
            types.Add(t);
            return t;
        }

        int imported = 0, skipped = 0;
        var errors = new List<string>();
        int row = 1;

        string? line;
        while ((line = await sr.ReadLineAsync(ct)) != null)
        {
            row++;
            if (string.IsNullOrWhiteSpace(line)) continue;
            try
            {
                var cells = ParseCsvLine(line);
                string Get(int i) => (i < 0 || i >= cells.Count) ? "" : cells[i];

                var name = Get(iName).Trim();
                var typeName = Get(iType).Trim();
                if (string.IsNullOrEmpty(name) || string.IsNullOrEmpty(typeName))
                {
                    skipped++;
                    errors.Add($"Row {row}: missing name or asset_type");
                    continue;
                }

                var type = FindOrCreateType(typeName, iCategory >= 0 ? Get(iCategory) : null);

                var asset = new Asset
                {
                    TenantId = cu.TenantId!.Value,
                    AssetTypeId = type.Id,
                    AssetType = type,
                    Name = name,
                    Description = iDesc >= 0 && !string.IsNullOrWhiteSpace(Get(iDesc)) ? Get(iDesc) : null,
                    Location = iLoc >= 0 && !string.IsNullOrWhiteSpace(Get(iLoc)) ? Get(iLoc) : null,
                    Quantity = iQty >= 0 && int.TryParse(Get(iQty), out var q) && q > 0 ? q : 1,
                    Status = iStatus >= 0 && Enum.TryParse<AssetStatus>(Get(iStatus), true, out var s) ? s : AssetStatus.InService,
                    PurchasePrice = iPrice >= 0 && decimal.TryParse(Get(iPrice), NumberStyles.Number, CultureInfo.InvariantCulture, out var pp) ? pp : null,
                    PurchasedOn = iPurchased >= 0 && DateOnly.TryParse(Get(iPurchased), out var po) ? po : null,
                    WarrantyUntil = iWarranty >= 0 && DateOnly.TryParse(Get(iWarranty), out var wu) ? wu : null,
                    CreatedBy = cu.UserId!.Value,
                    UpdatedAt = DateTimeOffset.UtcNow,
                };

                if (iCustom >= 0)
                {
                    var raw = Get(iCustom);
                    if (!string.IsNullOrWhiteSpace(raw))
                    {
                        try { asset.FieldValues = JsonDocument.Parse(raw); }
                        catch { /* skip bad JSON */ }
                    }
                }

                // Auto-tag
                var code = TagCodeGenerator.Generate();
                asset.Tags.Add(new AssetTag
                {
                    TenantId = cu.TenantId!.Value,
                    AssetId = asset.Id,
                    Code = code,
                    Format = "QR",
                });

                db.Assets.Add(asset);
                imported++;
            }
            catch (Exception ex)
            {
                skipped++;
                errors.Add($"Row {row}: {ex.Message}");
            }
        }

        audit.Log("Imported", "Asset", null, $"Imported {imported} assets via CSV (skipped {skipped})");
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(new ImportResult(imported, skipped, errors.Take(50).ToList()));
    }

    // ── CSV helpers ───────────────────────────────────────────────────

    static string Csv(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        var needsQuote = s.Contains(',') || s.Contains('"') || s.Contains('\n') || s.Contains('\r');
        if (!needsQuote) return s;
        return "\"" + s.Replace("\"", "\"\"") + "\"";
    }

    static List<string> ParseCsvLine(string line)
    {
        var result = new List<string>();
        var sb = new StringBuilder();
        bool inQuotes = false;
        for (int i = 0; i < line.Length; i++)
        {
            char c = line[i];
            if (inQuotes)
            {
                if (c == '"' && i + 1 < line.Length && line[i + 1] == '"') { sb.Append('"'); i++; }
                else if (c == '"') { inQuotes = false; }
                else { sb.Append(c); }
            }
            else
            {
                if (c == ',') { result.Add(sb.ToString()); sb.Clear(); }
                else if (c == '"' && sb.Length == 0) { inQuotes = true; }
                else { sb.Append(c); }
            }
        }
        result.Add(sb.ToString());
        return result;
    }
}
