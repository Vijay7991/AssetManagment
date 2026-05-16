using AssetHub.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Infrastructure;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<User> Users => Set<User>();
    public DbSet<TenantMembership> Memberships => Set<TenantMembership>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<TenantInvite> Invites => Set<TenantInvite>();
    public DbSet<AssetCategory> Categories => Set<AssetCategory>();
    public DbSet<AssetType> AssetTypes => Set<AssetType>();
    public DbSet<Asset> Assets => Set<Asset>();
    public DbSet<AssetTag> AssetTags => Set<AssetTag>();
    public DbSet<AssetPhoto> AssetPhotos => Set<AssetPhoto>();
    public DbSet<AssetMovement> AssetMovements => Set<AssetMovement>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();
    public DbSet<MaintenanceTicket> MaintenanceTickets => Set<MaintenanceTicket>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<Location> Locations => Set<Location>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        // ── Tenant ────────────────────────────────────────────────
        b.Entity<Tenant>(e =>
        {
            e.HasIndex(t => t.Slug).IsUnique();
        });

        // ── User ──────────────────────────────────────────────────
        b.Entity<User>(e =>
        {
            e.HasIndex(u => u.Email).IsUnique();
            e.HasIndex(u => u.Phone);
            e.HasIndex(u => u.IsRootAdmin);
            e.HasIndex(u => u.IsActive);
        });

        // ── TenantMembership ──────────────────────────────────────
        b.Entity<TenantMembership>(e =>
        {
            e.HasIndex(m => new { m.TenantId, m.UserId }).IsUnique();
            e.HasOne(m => m.Tenant).WithMany(t => t.Memberships)
                .HasForeignKey(m => m.TenantId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(m => m.User).WithMany(u => u.Memberships)
                .HasForeignKey(m => m.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── RefreshToken ──────────────────────────────────────────
        b.Entity<RefreshToken>(e =>
        {
            e.HasIndex(r => r.TokenHash).IsUnique();
            e.HasIndex(r => r.UserId);
        });

        // ── PasswordResetToken ────────────────────────────────────
        b.Entity<PasswordResetToken>(e =>
        {
            e.HasIndex(p => p.TokenHash).IsUnique();
            e.HasIndex(p => p.UserId);
            e.HasOne(p => p.User).WithMany(u => u.PasswordResets)
                .HasForeignKey(p => p.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── Invite ────────────────────────────────────────────────
        b.Entity<TenantInvite>(e =>
        {
            e.HasIndex(i => i.Token).IsUnique();
            e.HasIndex(i => new { i.TenantId, i.Email });
        });

        // ── Categories ────────────────────────────────────────────
        b.Entity<AssetCategory>(e =>
        {
            e.HasIndex(c => new { c.TenantId, c.Name });
            e.HasOne(c => c.Parent).WithMany(c => c.Children)
                .HasForeignKey(c => c.ParentId).OnDelete(DeleteBehavior.Restrict);
        });

        // ── AssetType ─────────────────────────────────────────────
        b.Entity<AssetType>(e =>
        {
            e.HasIndex(t => new { t.TenantId, t.Name });
            e.HasOne(t => t.Category).WithMany(c => c.Types)
                .HasForeignKey(t => t.CategoryId).OnDelete(DeleteBehavior.Restrict);
        });

        // ── Asset ─────────────────────────────────────────────────
        b.Entity<Asset>(e =>
        {
            e.HasIndex(a => new { a.TenantId, a.Name });
            e.HasIndex(a => new { a.TenantId, a.AssetTypeId });
            e.HasIndex(a => new { a.TenantId, a.Status });
            e.HasIndex(a => new { a.TenantId, a.LocationId });
            e.HasIndex(a => a.DeletedAt);
            e.HasOne(a => a.AssetType).WithMany(t => t.Assets)
                .HasForeignKey(a => a.AssetTypeId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(a => a.Location).WithMany()
                .HasForeignKey(a => a.LocationId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(a => a.AssignedToUser).WithMany()
                .HasForeignKey(a => a.AssignedToUserId).OnDelete(DeleteBehavior.SetNull);
            e.Property(a => a.PurchasePrice).HasPrecision(18, 2);
        });

        // ── Location ──────────────────────────────────────────────
        b.Entity<Location>(e =>
        {
            e.HasIndex(l => new { l.TenantId, l.Name });
            e.HasIndex(l => new { l.TenantId, l.City });
            e.HasIndex(l => l.IsActive);
        });

        // ── AssetTag ──────────────────────────────────────────────
        b.Entity<AssetTag>(e =>
        {
            e.HasIndex(t => new { t.TenantId, t.Code }).IsUnique();
            e.HasIndex(t => t.AssetId);
            e.HasOne(t => t.Asset).WithMany(a => a.Tags)
                .HasForeignKey(t => t.AssetId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── AssetPhoto ────────────────────────────────────────────
        b.Entity<AssetPhoto>(e =>
        {
            e.HasIndex(p => p.AssetId);
            e.HasOne(p => p.Asset).WithMany(a => a.Photos)
                .HasForeignKey(p => p.AssetId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── AssetMovement ─────────────────────────────────────────
        b.Entity<AssetMovement>(e =>
        {
            e.HasIndex(m => new { m.TenantId, m.AssetId, m.PerformedAt });
            e.HasOne(m => m.Asset).WithMany(a => a.Movements)
                .HasForeignKey(m => m.AssetId).OnDelete(DeleteBehavior.Cascade);
        });

        // ── AuditEvent ────────────────────────────────────────────
        b.Entity<AuditEvent>(e =>
        {
            e.HasIndex(a => new { a.TenantId, a.At });
            e.HasIndex(a => new { a.TenantId, a.EntityType, a.EntityId });
            e.HasIndex(a => new { a.TenantId, a.ActorUserId });
        });

        // ── MaintenanceTicket ─────────────────────────────────────
        b.Entity<MaintenanceTicket>(e =>
        {
            e.HasIndex(m => new { m.TenantId, m.Status });
            e.HasIndex(m => new { m.TenantId, m.AssetId });
            e.HasIndex(m => new { m.TenantId, m.AssignedToUserId });
            e.HasOne(m => m.Asset).WithMany()
                .HasForeignKey(m => m.AssetId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(m => m.AssignedToUser).WithMany()
                .HasForeignKey(m => m.AssignedToUserId).OnDelete(DeleteBehavior.SetNull);
            e.Property(m => m.Cost).HasPrecision(18, 2);
        });

        // ── Notification ──────────────────────────────────────────
        b.Entity<Notification>(e =>
        {
            e.HasIndex(n => new { n.TenantId, n.UserId, n.CreatedAt });
            e.HasIndex(n => new { n.UserId, n.ReadAt });
        });
    }
}
