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
using AssetHub.Api.Features.RootAdmin;
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
builder.Services.AddSingleton<IMailHealth, MailHealth>();
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

// Mail health — used by the UI to decide whether to offer the Email invite
// channel. Public so the login/forgot-password screens can also adapt if they
// want to surface "we can't actually email you a link right now".
app.MapGet("/api/health/mail", async (IMailHealth probe, CancellationToken ct) =>
{
    var status = await probe.GetAsync(ct);
    return Results.Ok(new {
        enabled = status.Enabled,
        lastChecked = status.LastChecked,
        reason = status.Reason,
    });
}).AllowAnonymous();

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
app.MapRootAdminEndpoints();

// OpenAPI JSON in dev — browse with Postman/Bruno/Insomnia, or paste into a UI viewer.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Bring the database schema up to date on startup.
//
//   * Development: `EnsureCreatedAsync` is kept as the default so a fresh `docker
//     compose up` still works without any EF tooling on the host. This skips the
//     migration history table — it's a dev convenience only.
//
//   * Non-Development (Staging/Production): `MigrateAsync` is used so every
//     deployment applies pending migrations exactly once and the schema is
//     reproducible. Generate the initial migration with:
//
//         cd api && dotnet ef migrations add InitialCreate -o Migrations
//
//     and commit the `Migrations/` folder. After that, every schema change is
//     `dotnet ef migrations add <Name>` + a redeploy.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var log = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    var useMigrations = !app.Environment.IsDevelopment();

    var attempts = 0;
    while (true)
    {
        try
        {
            if (useMigrations)
            {
                await db.Database.MigrateAsync();
                log.LogInformation("Database migrations applied.");
            }
            else
            {
                await db.Database.EnsureCreatedAsync();
                log.LogInformation("Database schema verified (EnsureCreated, dev mode).");
            }
            break;
        }
        catch (Exception ex) when (attempts++ < 10)
        {
            log.LogWarning("DB not ready yet ({attempt}/10): {message}", attempts, ex.Message);
            await Task.Delay(TimeSpan.FromSeconds(3));
        }
    }

    // Promote the configured email to root admin if it already exists. If the
    // address hasn't signed up yet, the flag will be set on next startup once
    // the account is created — running this idempotently every boot is fine.
    var rootEmail = builder.Configuration["RootAdmin:Email"]?.Trim().ToLowerInvariant();
    if (!string.IsNullOrEmpty(rootEmail))
    {
        var rootUser = await db.Users.FirstOrDefaultAsync(u => u.Email == rootEmail);
        if (rootUser is not null)
        {
            if (!rootUser.IsRootAdmin || !rootUser.IsActive)
            {
                rootUser.IsRootAdmin = true;
                rootUser.IsActive = true;
                rootUser.DeactivatedAt = null;
                await db.SaveChangesAsync();
                log.LogInformation("Root admin promoted: {Email}", rootEmail);
            }
        }
        else
        {
            log.LogInformation(
                "RootAdmin:Email is set to {Email} but no such account exists yet. " +
                "The user will be promoted automatically after they sign up.",
                rootEmail);
        }
    }
}

// Ensure uploads directory exists
Directory.CreateDirectory(storageOpts.UploadsPath);

app.Run();
