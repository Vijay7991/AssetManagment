# Restores a SQL dump produced by backup.ps1 back into the running db container.
# This OVERWRITES everything currently in the database — there is no undo, so
# the script confirms before proceeding (skip with -Yes for automation).
#
# Usage:
#   .\scripts\restore.ps1 .\backups\assethub_2026-05-16_14-30-00.sql
#   .\scripts\restore.ps1 .\backups\assethub_2026-05-16_14-30-00.sql -Yes

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$BackupFile,
    [switch]$Yes
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

if (-not (Test-Path $BackupFile)) {
    Write-Error "Backup file not found: $BackupFile"
    exit 1
}
$BackupFile = (Resolve-Path $BackupFile).Path

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
    Write-Error "The 'db' service isn't running. Start it with: docker compose up -d db"
    exit 1
}

if (-not $Yes) {
    Write-Host "About to OVERWRITE database '$dbName' with $BackupFile" -ForegroundColor Yellow
    Write-Host "All current data in that database will be lost." -ForegroundColor Yellow
    $confirm = Read-Host "Type 'restore' to confirm"
    if ($confirm -ne "restore") {
        Write-Host "Aborted."
        exit 1
    }
}

# Stop the API so we're not racing with active writes during the load.
Write-Host "Stopping API for a clean restore..."
docker compose stop api 2>$null | Out-Null

Write-Host "Restoring $BackupFile -> $dbName"
Get-Content $BackupFile -Raw | docker compose exec -T db psql -U $dbUser -d $dbName --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Warning "psql exited with code $LASTEXITCODE — restore may be incomplete."
}

Write-Host "Restarting API..."
docker compose start api | Out-Null

Write-Host "Done."
