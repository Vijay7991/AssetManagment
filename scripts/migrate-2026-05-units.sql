-- Data-preserving migration for the accounts + unit-tracking releases.
--
-- Safe to run on:
--   * A pre-accounts DB (only the original ~13 tables)
--   * A post-accounts, pre-units DB
--   * A fully up-to-date DB (every statement is idempotent — IF NOT EXISTS / IF EXISTS)
--
-- This brings the DB up to the entity shape the current API expects without
-- touching any user data. EF Core's EnsureCreatedAsync does nothing once
-- tables exist, so this script fills the gap that a real migration framework
-- would normally handle.
--
-- Run via scripts/migrate.ps1 or scripts/migrate.sh.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────
-- Accounts release: User + PasswordResetTokens
-- ───────────────────────────────────────────────────────────────────────

ALTER TABLE "Users"
    ADD COLUMN IF NOT EXISTS "IsActive" boolean NOT NULL DEFAULT true;

ALTER TABLE "Users"
    ADD COLUMN IF NOT EXISTS "IsRootAdmin" boolean NOT NULL DEFAULT false;

ALTER TABLE "Users"
    ADD COLUMN IF NOT EXISTS "DeactivatedAt" timestamp with time zone NULL;

CREATE INDEX IF NOT EXISTS "IX_Users_IsRootAdmin" ON "Users" ("IsRootAdmin");
CREATE INDEX IF NOT EXISTS "IX_Users_IsActive"    ON "Users" ("IsActive");

CREATE TABLE IF NOT EXISTS "PasswordResetTokens" (
    "Id"             uuid PRIMARY KEY,
    "UserId"         uuid NOT NULL REFERENCES "Users"("Id") ON DELETE CASCADE,
    "TokenHash"      varchar(200) NOT NULL,
    "Source"         varchar(20)  NOT NULL,
    "IssuedByUserId" uuid NULL,
    "ExpiresAt"      timestamp with time zone NOT NULL,
    "ConsumedAt"     timestamp with time zone NULL,
    "CreatedAt"      timestamp with time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "IX_PasswordResetTokens_TokenHash"
    ON "PasswordResetTokens" ("TokenHash");
CREATE INDEX IF NOT EXISTS "IX_PasswordResetTokens_UserId"
    ON "PasswordResetTokens" ("UserId");


-- ───────────────────────────────────────────────────────────────────────
-- Unit-tracking release: Asset / AssetType flags, AssetTag.UnitId,
-- AssetMovement.UnitId, AssetUnits table
-- ───────────────────────────────────────────────────────────────────────

ALTER TABLE "Assets"
    ADD COLUMN IF NOT EXISTS "IsUnitTracked" boolean NOT NULL DEFAULT false;

ALTER TABLE "AssetTypes"
    ADD COLUMN IF NOT EXISTS "TrackByUnit" boolean NOT NULL DEFAULT false;

ALTER TABLE "AssetTags"
    ADD COLUMN IF NOT EXISTS "UnitId" uuid NULL;

ALTER TABLE "AssetMovements"
    ADD COLUMN IF NOT EXISTS "UnitId" uuid NULL;

CREATE TABLE IF NOT EXISTS "AssetUnits" (
    "Id"                 uuid PRIMARY KEY,
    "TenantId"           uuid NOT NULL,
    "AssetId"            uuid NOT NULL REFERENCES "Assets"("Id") ON DELETE CASCADE,
    "UnitNumber"         integer NOT NULL,
    "SerialNumber"       varchar(120) NULL,
    "Status"             integer NOT NULL DEFAULT 0,
    "FieldValues"        jsonb NULL,
    "PurchasePrice"      numeric(18,2) NULL,
    "PurchasedOn"        date NULL,
    "WarrantyUntil"      date NULL,
    "LocationId"         uuid NULL REFERENCES "Locations"("Id") ON DELETE SET NULL,
    "LocationDetail"     varchar(120) NULL,
    "AssignedToUserId"   uuid NULL REFERENCES "Users"("Id") ON DELETE SET NULL,
    "CreatedBy"          uuid NOT NULL,
    "CreatedAt"          timestamp with time zone NOT NULL,
    "UpdatedAt"          timestamp with time zone NOT NULL,
    "DeletedAt"          timestamp with time zone NULL
);

CREATE INDEX IF NOT EXISTS "IX_AssetUnits_TenantId_AssetId"      ON "AssetUnits" ("TenantId", "AssetId");
CREATE INDEX IF NOT EXISTS "IX_AssetUnits_TenantId_Status"       ON "AssetUnits" ("TenantId", "Status");
CREATE INDEX IF NOT EXISTS "IX_AssetUnits_TenantId_SerialNumber" ON "AssetUnits" ("TenantId", "SerialNumber");
CREATE INDEX IF NOT EXISTS "IX_AssetUnits_DeletedAt"             ON "AssetUnits" ("DeletedAt");
CREATE INDEX IF NOT EXISTS "IX_AssetUnits_LocationId"            ON "AssetUnits" ("LocationId");
CREATE INDEX IF NOT EXISTS "IX_AssetUnits_AssignedToUserId"      ON "AssetUnits" ("AssignedToUserId");

-- Tie AssetTag.UnitId and AssetMovement.UnitId to the new AssetUnits table.
-- Use DO blocks so the FKs are only added once — postgres has no
-- "ADD CONSTRAINT IF NOT EXISTS" for table-level constraints pre-PG16.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'AssetTags' AND constraint_name = 'FK_AssetTags_AssetUnits_UnitId'
    ) THEN
        ALTER TABLE "AssetTags"
            ADD CONSTRAINT "FK_AssetTags_AssetUnits_UnitId"
            FOREIGN KEY ("UnitId") REFERENCES "AssetUnits"("Id") ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'AssetMovements' AND constraint_name = 'FK_AssetMovements_AssetUnits_UnitId'
    ) THEN
        ALTER TABLE "AssetMovements"
            ADD CONSTRAINT "FK_AssetMovements_AssetUnits_UnitId"
            FOREIGN KEY ("UnitId") REFERENCES "AssetUnits"("Id") ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IX_AssetTags_UnitId"                          ON "AssetTags" ("UnitId");
CREATE INDEX IF NOT EXISTS "IX_AssetMovements_TenantId_UnitId_PerformedAt"
    ON "AssetMovements" ("TenantId", "UnitId", "PerformedAt");

COMMIT;
