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
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ─── Options ─────────────────────────────────────────────────────────
var jwtOpts = builder.Configuration.GetSection("Jwt").Get<JwtOptions>()
    ?? throw new InvalidOperationException("Jwt config section missing");
if (jwtOpts.Secret.Length < 32)
    throw new InvalidOperationException("Jwt:Secret must be at least 32 characters.");

var resendOpts = new ResendOptions
{
    ApiKey = builder.Configuration["Resend:ApiKey"] ?? builder.Configuration["RESEND_API_KEY"] ?? "",
    From   = builder.Configuration["Resend:From"] ?? "AssetHub <no-reply@mail.assethub.uk>",
};
var storageOpts = builder.Configuration.GetSection("Storage").Get<StorageOptions>() ?? new StorageOptions();
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:3000" };

builder.Services.AddSingleton(jwtOpts);
builder.Services.AddSingleton(resendOpts);
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
builder.Services.AddHttpClient("resend", c =>
{
    c.BaseAddress = new Uri("https://api.resend.com/");
    c.DefaultRequestHeaders.Authorization =
        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", resendOpts.ApiKey);
});
builder.Services.AddSingleton<IMailSettings, MailSettingsService>();
builder.Services.AddSingleton<IEmailSender, ResendEmailSender>();
builder.Services.AddSingleton<IMailHealth, MailHealth>();
builder.Services.AddScoped<IAuditLogger, AuditLogger>();
builder.Services.AddScoped<INotifier, Notifier>();
// Register the warranty service as a singleton AND as a hosted service so we
// can both run it on the schedule and resolve it for the manual-trigger endpoint.
builder.Services.AddSingleton<WarrantyNotificationService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<WarrantyNotificationService>());

// ─── Rate limiting ───────────────────────────────────────────────────
// Throttles credential-handling endpoints to blunt brute-force / enumeration.
// "auth-credentials" (login/signup): tight, IP-keyed.
// "auth-refresh": looser since legitimate browsers refresh on every page load.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    o.AddPolicy("auth-credentials", ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));

    o.AddPolicy("auth-refresh", ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 60,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));
});

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
app.UseRateLimiter();
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

// Manual trigger for warranty scan — useful for testing without waiting.
// Restricted to platform root admins to prevent tenant users from forcing
// background work on the host.
app.MapPost("/api/admin/scan-warranties", async (
    WarrantyNotificationService svc, ICurrentUser cu, CancellationToken ct) =>
{
    if (!cu.IsRootAdmin) return Results.Forbid();
    await svc.ScanOnceAsync(ct);
    return Results.Ok(new { ran = true });
}).RequireAuthorization();

// Feature endpoints
app.MapAuthEndpoints();
app.MapTenantEndpoints();
app.MapCatalogEndpoints();
app.MapAssetEndpoints();
app.MapAssetUnitEndpoints();
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

    // Idempotent schema patches for columns/tables added after initial EnsureCreated.
    // (EnsureCreated never alters an existing schema, so we patch by hand here.)
    await db.Database.ExecuteSqlRawAsync(
        "ALTER TABLE \"Assets\" ADD COLUMN IF NOT EXISTS \"Currency\" VARCHAR(3) NOT NULL DEFAULT 'USD'");

    await db.Database.ExecuteSqlRawAsync(@"
        CREATE TABLE IF NOT EXISTS ""SystemSettings"" (
            ""Key"" text NOT NULL PRIMARY KEY,
            ""Value"" text NOT NULL,
            ""UpdatedAt"" timestamptz NOT NULL,
            ""UpdatedByUserId"" uuid NULL
        );");

    await db.Database.ExecuteSqlRawAsync(@"
        CREATE TABLE IF NOT EXISTS ""EmailVerificationTokens"" (
            ""Id"" uuid NOT NULL PRIMARY KEY,
            ""UserId"" uuid NOT NULL REFERENCES ""Users""(""Id"") ON DELETE CASCADE,
            ""TokenHash"" text NOT NULL,
            ""ExpiresAt"" timestamptz NOT NULL,
            ""ConsumedAt"" timestamptz NULL,
            ""CreatedAt"" timestamptz NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ""IX_EmailVerificationTokens_TokenHash""
            ON ""EmailVerificationTokens"" (""TokenHash"");
        CREATE INDEX IF NOT EXISTS ""IX_EmailVerificationTokens_UserId""
            ON ""EmailVerificationTokens"" (""UserId"");");

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
