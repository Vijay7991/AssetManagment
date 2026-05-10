using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;

namespace AssetHub.Api.Domain;

// ─── Tenancy ─────────────────────────────────────────────────────────

public class Tenant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(120)] public string Name { get; set; } = "";
    [MaxLength(80)]  public string Slug { get; set; } = "";   // URL-safe identifier
    public TenantPlan Plan { get; set; } = TenantPlan.Free;
    public TenantStatus Status { get; set; } = TenantStatus.Active;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<TenantMembership> Memberships { get; set; } = new List<TenantMembership>();
}

public enum TenantPlan { Free = 0, Pro = 1, Enterprise = 2 }
public enum TenantStatus { Active = 0, Suspended = 1, Deleted = 2 }

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(180)] public string Email { get; set; } = "";
    [MaxLength(20)]  public string? Phone { get; set; }
    [MaxLength(120)] public string DisplayName { get; set; } = "";
    [MaxLength(200)] public string PasswordHash { get; set; } = "";
    public bool EmailVerified { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastLoginAt { get; set; }

    public ICollection<TenantMembership> Memberships { get; set; } = new List<TenantMembership>();
    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
}

public class TenantMembership
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    [MaxLength(40)] public string Role { get; set; } = "Member";  // Admin, Manager, Member
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class RefreshToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    [MaxLength(200)] public string TokenHash { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class TenantInvite
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    [MaxLength(180)] public string Email { get; set; } = "";
    [MaxLength(20)]  public string? Phone { get; set; }
    [MaxLength(20)]  public string? Channel { get; set; }   // "Email" or "WhatsApp"
    [MaxLength(40)]  public string Role { get; set; } = "Member";
    [MaxLength(80)]  public string Token { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? AcceptedAt { get; set; }
    public Guid CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

// ─── Catalog ─────────────────────────────────────────────────────────

public class AssetCategory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid? ParentId { get; set; }
    public AssetCategory? Parent { get; set; }
    [MaxLength(120)] public string Name { get; set; } = "";
    [MaxLength(40)]  public string? Icon { get; set; }
    [MaxLength(20)]  public string? Color { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<AssetCategory> Children { get; set; } = new List<AssetCategory>();
    public ICollection<AssetType> Types { get; set; } = new List<AssetType>();
}

public class AssetType
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid CategoryId { get; set; }
    public AssetCategory Category { get; set; } = null!;
    [MaxLength(120)] public string Name { get; set; } = "";
    [MaxLength(40)]  public string? Icon { get; set; }

    /// JSON schema describing custom fields. Stored as JSONB.
    /// Example: [{"key":"serial","label":"Serial Number","type":"string","required":true},
    ///           {"key":"cpu","label":"CPU","type":"string"},
    ///           {"key":"ram_gb","label":"RAM (GB)","type":"number"}]
    [Column(TypeName = "jsonb")]
    public JsonDocument? FieldSchema { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<Asset> Assets { get; set; } = new List<Asset>();
}

// ─── Assets ──────────────────────────────────────────────────────────

public class Asset
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid AssetTypeId { get; set; }
    public AssetType AssetType { get; set; } = null!;

    [MaxLength(200)] public string Name { get; set; } = "";
    [MaxLength(2000)] public string? Description { get; set; }
    [MaxLength(120)] public string? Location { get; set; }
    public int Quantity { get; set; } = 1;
    public AssetStatus Status { get; set; } = AssetStatus.InService;

    /// Per-instance values matching the AssetType.FieldSchema. JSONB.
    [Column(TypeName = "jsonb")]
    public JsonDocument? FieldValues { get; set; }

    public decimal? PurchasePrice { get; set; }
    public DateOnly? PurchasedOn { get; set; }
    public DateOnly? WarrantyUntil { get; set; }

    public Guid? AssignedToUserId { get; set; }
    public User? AssignedToUser { get; set; }

    public Guid CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DeletedAt { get; set; }

    public ICollection<AssetTag> Tags { get; set; } = new List<AssetTag>();
    public ICollection<AssetPhoto> Photos { get; set; } = new List<AssetPhoto>();
    public ICollection<AssetMovement> Movements { get; set; } = new List<AssetMovement>();
}

public enum AssetStatus
{
    InService = 0,
    InStorage = 1,
    InRepair = 2,
    Retired = 3,
    Lost = 4,
}

public class AssetTag
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid AssetId { get; set; }
    public Asset Asset { get; set; } = null!;
    [MaxLength(20)] public string Code { get; set; } = "";       // 10-char base32, unique per tenant
    [MaxLength(20)] public string Format { get; set; } = "QR";   // QR, CODE128, DATAMATRIX
    public AssetTagStatus Status { get; set; } = AssetTagStatus.Active;
    public DateTimeOffset? PrintedAt { get; set; }
    public DateTimeOffset? RetiredAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public enum AssetTagStatus { Active = 0, Retired = 1, Lost = 2 }

public class AssetPhoto
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid AssetId { get; set; }
    public Asset Asset { get; set; } = null!;
    [MaxLength(300)] public string FileName { get; set; } = "";
    [MaxLength(500)] public string StoragePath { get; set; } = "";
    [MaxLength(60)]  public string ContentType { get; set; } = "";
    public long SizeBytes { get; set; }
    public bool IsCover { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid CreatedBy { get; set; }
}

public class AssetMovement
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid AssetId { get; set; }
    public Asset Asset { get; set; } = null!;
    [MaxLength(40)]  public string Kind { get; set; } = "";      // CheckOut, CheckIn, Move, Status
    [MaxLength(120)] public string? FromLocation { get; set; }
    [MaxLength(120)] public string? ToLocation { get; set; }
    public Guid? FromUserId { get; set; }
    public Guid? ToUserId { get; set; }
    [MaxLength(500)] public string? Notes { get; set; }
    public Guid PerformedBy { get; set; }
    public DateTimeOffset PerformedAt { get; set; } = DateTimeOffset.UtcNow;
}

// ─── Audit ───────────────────────────────────────────────────────────

public class AuditEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid? ActorUserId { get; set; }
    [MaxLength(180)] public string? ActorEmail { get; set; }
    [MaxLength(60)]  public string Verb { get; set; } = "";       // Created, Updated, Deleted, Assigned, ...
    [MaxLength(60)]  public string EntityType { get; set; } = ""; // Asset, AssetType, Tag, MaintenanceTicket, ...
    public Guid? EntityId { get; set; }
    [MaxLength(300)] public string Summary { get; set; } = "";
    [Column(TypeName = "jsonb")] public JsonDocument? Payload { get; set; }
    public DateTimeOffset At { get; set; } = DateTimeOffset.UtcNow;
}

// ─── Maintenance ─────────────────────────────────────────────────────

public class MaintenanceTicket
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid AssetId { get; set; }
    public Asset Asset { get; set; } = null!;
    [MaxLength(200)] public string Title { get; set; } = "";
    [MaxLength(2000)] public string? Description { get; set; }
    public MaintenanceKind Kind { get; set; } = MaintenanceKind.Corrective;
    public MaintenanceStatus Status { get; set; } = MaintenanceStatus.Open;
    public MaintenancePriority Priority { get; set; } = MaintenancePriority.Medium;
    public Guid? AssignedToUserId { get; set; }
    public User? AssignedToUser { get; set; }
    public DateTimeOffset? ScheduledFor { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public decimal? Cost { get; set; }
    public Guid CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public enum MaintenanceKind { Preventive = 0, Corrective = 1, Inspection = 2 }
public enum MaintenanceStatus { Open = 0, InProgress = 1, Done = 2, Cancelled = 3 }
public enum MaintenancePriority { Low = 0, Medium = 1, High = 2, Critical = 3 }

// ─── Notifications ───────────────────────────────────────────────────

public class Notification
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid UserId { get; set; }   // Recipient
    [MaxLength(40)]  public string Kind { get; set; } = "";       // AssetAssigned, MaintenanceAssigned, ...
    [MaxLength(200)] public string Title { get; set; } = "";
    [MaxLength(500)] public string? Body { get; set; }
    [MaxLength(200)] public string? Link { get; set; }            // app-relative URL
    public DateTimeOffset? ReadAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
