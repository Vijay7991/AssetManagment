using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace AssetHub.Api.Infrastructure;

/// <summary>
/// Design-time factory used by `dotnet ef` (migrations add / database update / script).
/// Reads the connection string from the ConnectionStrings__Default env var when present
/// (matches docker-compose), otherwise falls back to a sensible local default so
/// `dotnet ef migrations add Foo` works straight from a clean checkout.
/// </summary>
public class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__Default")
            ?? "Host=localhost;Port=5432;Database=assethub;Username=assethub;Password=changeme_in_prod";

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new AppDbContext(options);
    }
}
