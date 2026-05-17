# Applies the data-preserving SQL migration against the running db container.
# Use this when a release adds new columns/tables and you want to keep all
# existing data (assets, members, etc.) — no `down -v` required.
#
# Usage:
#   .\scripts\migrate.ps1
#   .\scripts\migrate.ps1 -File .\scripts\migrate-2026-05-units.sql   # explicit
#
# Default file path matches the most recent migration script in this repo.

[CmdletBinding()]
param(
    [string]$File = (Join-Path $PSScriptRoot "migrate-2026-05-units.sql"),
    [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

if (-not (Test-Path $File)) {
    Write-Error "Migration file not found: $File"
    exit 1
}
$File = (Resolve-Path $File).Path

$dbUser = "assethub"
$dbName = "assethub"
if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
        if ($_ -match '^\s*POSTGRES_USER\s*=\s*(.+)$') { $dbUser = $matches[1].Trim() }
        if ($_ -match '^\s*POSTGRES_DB\s*=\s*(.+)$')   { $dbName = $matches[1].Trim() }
    }
}

$running = docker compose ps db --status running --quiet 2>$null
if (-not $running) {
    Write-Error "The 'db' service isn't running. Start it first: docker compose up -d db"
    exit 1
}

# Always take a backup first — migrations should be reversible by hand, but
# the dump is cheap insurance if you need to roll back.
if (-not $NoBackup) {
    Write-Host "Backing up first (use -NoBackup to skip)..." -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "backup.ps1") -Tag "pre-migrate"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Backup failed. Aborting migration."
        exit $LASTEXITCODE
    }
}

Write-Host ""
Write-Host "Applying migration: $File" -ForegroundColor Cyan
Get-Content $File -Raw | docker compose exec -T db psql -U $dbUser -d $dbName --set ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Migration failed with exit code $LASTEXITCODE. The DB is unchanged because the script runs in a transaction."
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Migration applied. Restarting the API so it picks up the new schema..." -ForegroundColor Cyan
docker compose restart api | Out-Null

Write-Host "Done. Tail the logs to confirm a clean start:"
Write-Host "  docker compose logs -f api"
