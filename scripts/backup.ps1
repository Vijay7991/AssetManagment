# Dumps the AssetHub Postgres database into ./backups/ with a timestamped
# filename. Safe to run any time — pg_dump is read-only.
#
# Usage:
#   .\scripts\backup.ps1                # → .\backups\assethub_2026-05-16_14-30-00.sql
#   .\scripts\backup.ps1 -Tag nightly   # → .\backups\assethub_nightly_2026-05-16_14-30-00.sql

[CmdletBinding()]
param(
    [string]$Tag = ""
)

$ErrorActionPreference = "Stop"

# Resolve project root regardless of where the script is invoked from.
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

# Pull POSTGRES_USER / POSTGRES_DB from .env so we don't hardcode them. If the
# .env is missing, fall back to the same defaults baked into .env.example.
$dbUser = "assethub"
$dbName = "assethub"
if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
        if ($_ -match '^\s*POSTGRES_USER\s*=\s*(.+)$') { $dbUser = $matches[1].Trim() }
        if ($_ -match '^\s*POSTGRES_DB\s*=\s*(.+)$')   { $dbName = $matches[1].Trim() }
    }
}

$backupDir = Join-Path $ProjectRoot "backups"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$prefix = if ($Tag) { "assethub_${Tag}_" } else { "assethub_" }
$outFile = Join-Path $backupDir "${prefix}${timestamp}.sql"

# Make sure the db container is up — otherwise the pg_dump call returns a
# cryptic error about exec failing.
$running = docker compose ps db --status running --quiet 2>$null
if (-not $running) {
    Write-Error "The 'db' service isn't running. Start it with: docker compose up -d db"
    exit 1
}

Write-Host "Dumping $dbName -> $outFile"
docker compose exec -T db pg_dump -U $dbUser -d $dbName --clean --if-exists | Out-File -FilePath $outFile -Encoding utf8

if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_dump failed (exit $LASTEXITCODE). The output file may be incomplete."
    exit $LASTEXITCODE
}

$size = (Get-Item $outFile).Length
$sizeKb = [Math]::Round($size / 1KB, 1)
Write-Host "Done. Backup is $sizeKb KB."
Write-Host $outFile
