using System.Text;
using AssetHub.Api.Features.Assets;
using AssetHub.Api.Features.Audit;
using AssetHub.Api.Features.Auth;
using AssetHub.Api.Features.Catalog;
using AssetHub.Api.Features.Files;
using AssetHub.Api.Features.Imports;
using AssetHub.Api.Features.Locations;
using AssetHub.Api.Features.Maintenance;
using AssetHub.Api.Features.Movements;
using AssetHub.Api.Features.Notifications;
using AssetHub.Api.Features.Tags;
using AssetHub.Api.Features.Tenants;
using AssetHub.Api.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ─── Options ─────────────────────────────────────────────────────────
var jwtOpts = builder.Configuration.GetSection("Jwt").Get<JwtOptions>()
    ?? throw new InvalidOperationException("Jwt config section missing");
if (jwtOpts.Secret.Length < 32)
    throw new InvalidOperationException("Jwt:Secret must be at least 32 characters.");

var smtpOpts = builder.Configuration.GetSection("Smtp").Get<SmtpOptions>() ?? new SmtpOptions();
var storageOpts = builder.Configuration.GetSection("Storage").Get<StorageOptions>() ?? new StorageOptions();
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:3000" };

builder.Services.AddSingleton(jwtOpts);
builder.Services.AddSingleton(smtpOpts);
builder.Services.AddSingleton(storageOpts);

// ─── Database ────────────────────────────────────────────────────────
builder.Services.AddDbContext<AppDbContext>(opts =>
    opts.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

// ─── Auth ────────────────────────────────────────────────────────────
// Disable JsonWebTokenHandler's default short→long claim-name mapping at the
// process level so "tenant_id", "sub", etc. stay exactly as we issued them.
Microsoft.IdentityModel.JsonWebTokens.JsonWebTokenHandler.DefaultMapInboundClaims = false;
System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler.DefaultMapInboundClaims = false;

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.RequireHttpsMetadata = false;
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = jwtOpts.Issuer,
            ValidAudience = jwtOpts.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOpts.Secret)),
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(2),
            NameClaimType = "name",
            RoleClaimType = "role",
        };
    });
builder.Services.AddAuthorization();

// ─── Services ────────────────────────────────────────────────────────
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddSingleton<IJwtTokenService, JwtTokenService>();
builder.Services.AddSingleton<IBarcodeRenderer, BarcodeRenderer>();
builder.Services.AddSingleton<IEmailSender, SmtpEmailSender>();
builder.Services.AddScoped<IAuditLogger, AuditLogger>();
builder.Services.AddScoped<INotifier, Notifier>();
// Register the warranty service as a singleton AND as a hosted service so we
// can both run it on the schedule and resolve it for the manual-trigger endpoint.
builder.Services.AddSingleton<WarrantyNotificationService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<WarrantyNotificationService>());

// ─── CORS ────────────────────────────────────────────────────────────
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(allowedOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials()));

// ─── OpenAPI ─────────────────────────────────────────────────────────
builder.Services.AddOpenApi();

// ─── App ─────────────────────────────────────────────────────────────
var app = builder.Build();

// Honor X-Forwarded-* headers from Caddy so URLs we generate use the
// scheme/host the browser actually saw (https://localhost or LAN IP).
var fwd = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost,
};
fwd.KnownNetworks.Clear();
fwd.KnownProxies.Clear();
app.UseForwardedHeaders(fwd);

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

// Health
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", time = DateTimeOffset.UtcNow }))
   .AllowAnonymous();

// Whoami — diagnostic endpoint, returns parsed user/tenant + raw claims
app.MapGet("/api/whoami", (ICurrentUser cu, HttpContext ctx) =>
{
    var claims = ctx.User.Claims.Select(c => new { type = c.Type, value = c.Value }).ToList();
    return Results.Ok(new {
        cu.IsAuthenticated,
        cu.UserId,
        cu.TenantId,
        cu.Role,
        cu.Email,
        claims,
    });
}).RequireAuthorization();

// Manual trigger for warranty scan — useful for testing without waiting
app.MapPost("/api/admin/scan-warranties", async (
    WarrantyNotificationService svc, CancellationToken ct) =>
{
    await svc.ScanOnceAsync(ct);
    return Results.Ok(new { ran = true });
}).RequireAuthorization();

// Feature endpoints
app.MapAuthEndpoints();
app.MapTenantEndpoints();
app.MapCatalogEndpoints();
app.MapAssetEndpoints();
app.MapTagEndpoints();
app.MapFileEndpoints();
app.MapMovementEndpoints();
app.MapAuditEndpoints();
app.MapMaintenanceEndpoints();
app.MapNotificationEndpoints();
app.MapImportExportEndpoints();
app.MapLocationEndpoints();

// OpenAPI JSON in dev — browse with Postman/Bruno/Insomnia, or paste into a UI viewer.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Auto-create the database schema on startup. For a real production migration
// strategy, switch to `dotnet ef database update` and remove this block.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var log = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    var attempts = 0;
    while (true)
    {
        try
        {
            await db.Database.EnsureCreatedAsync();
            log.LogInformation("Database schema verified.");
            break;
        }
        catch (Exception ex) when (attempts++ < 10)
        {
            log.LogWarning("DB not ready yet ({attempt}/10): {message}", attempts, ex.Message);
            await Task.Delay(TimeSpan.FromSeconds(3));
        }
    }
}

// Ensure uploads directory exists
Directory.CreateDirectory(storageOpts.UploadsPath);

app.Run();
