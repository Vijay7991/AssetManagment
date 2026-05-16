# Wraps the destructive "wipe DB + rebuild" path (`docker compose down -v`)
# with an automatic backup first. Use this whenever you've pulled a release
# that adds new columns or tables — backup.ps1 runs, then the volumes are
# blown away, then the stack rebuilds from scratch.
#
# Usage:
#   .\scripts\safe-rebuild.ps1                 # backup -> down -v -> build -> up
#   .\scripts\safe-rebuild.ps1 -NoBackup       # skip the backup (you have one already)

[CmdletBinding()]
param(
    [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

if (-not $NoBackup) {
    $running = docker compose ps db --status running --quiet 2>$null
    if ($running) {
        Write-Host "Step 1/4: backup" -ForegroundColor Cyan
        & (Join-Path $PSScriptRoot "backup.ps1") -Tag "pre-rebuild"
    } else {
        Write-Host "Step 1/4: backup skipped (db not running -- nothing to back up)" -ForegroundColor Yellow
    }
} else {
    Write-Host "Step 1/4: backup skipped (-NoBackup)" -ForegroundColor Yellow
}

Write-Host "Step 2/4: stopping stack and removing volumes (this wipes the DB)" -ForegroundColor Cyan
docker compose down -v
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Step 3/4: rebuilding images" -ForegroundColor Cyan
docker compose build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Step 4/4: starting stack" -ForegroundColor Cyan
docker compose up -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Done. Watch logs with: docker compose logs -f api"
Write-Host "To restore the data you just dumped:"
Write-Host "  .\scripts\restore.ps1 .\backups\assethub_pre-rebuild_<timestamp>.sql"
