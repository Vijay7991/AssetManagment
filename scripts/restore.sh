#!/usr/bin/env bash
# Restores a SQL dump produced by backup.sh back into the running db container.
# This OVERWRITES everything currently in the database — there is no undo, so
# the script confirms before proceeding (skip with --yes for automation).
#
# Usage:
#   ./scripts/restore.sh ./backups/assethub_2026-05-16_14-30-00.sql
#   ./scripts/restore.sh ./backups/assethub_2026-05-16_14-30-00.sql --yes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup-file.sql> [--yes]" >&2
  exit 2
fi

BACKUP_FILE="$1"
ASSUME_YES="${2:-}"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
fi
DB_USER="${POSTGRES_USER:-assethub}"
DB_NAME="${POSTGRES_DB:-assethub}"

if ! docker compose ps db --status running --quiet | grep -q .; then
  echo "ERROR: the 'db' service isn't running. Start it with: docker compose up -d db" >&2
  exit 1
fi

if [[ "$ASSUME_YES" != "--yes" ]]; then
  echo "About to OVERWRITE database '$DB_NAME' with $BACKUP_FILE"
  echo "All current data in that database will be lost."
  read -r -p "Type 'restore' to confirm: " confirm
  if [[ "$confirm" != "restore" ]]; then
    echo "Aborted." >&2
    exit 1
  fi
fi

# Stop the API so it doesn't try to write into the database mid-restore. The
# db container itself keeps running — we only need it to accept the psql input.
echo "Stopping API for a clean restore…"
docker compose stop api >/dev/null 2>&1 || true

echo "Restoring $BACKUP_FILE → $DB_NAME"
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" --quiet < "$BACKUP_FILE"

echo "Restarting API…"
docker compose start api >/dev/null

echo "Done."
