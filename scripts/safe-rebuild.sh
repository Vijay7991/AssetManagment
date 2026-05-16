#!/usr/bin/env bash
# Wraps the destructive "wipe DB + rebuild" path (`docker compose down -v`)
# with an automatic backup first. Use this whenever you've pulled a release
# that adds new columns or tables — backup.sh runs, then the volumes are
# blown away, then the stack rebuilds from scratch.
#
# Usage:
#   ./scripts/safe-rebuild.sh             # backup → down -v → build → up
#   ./scripts/safe-rebuild.sh --no-backup # skip the backup (you have one already)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

SKIP_BACKUP=""
if [[ "${1:-}" == "--no-backup" ]]; then SKIP_BACKUP=1; fi

if [[ -z "$SKIP_BACKUP" ]]; then
  if docker compose ps db --status running --quiet | grep -q .; then
    echo "Step 1/4: backup"
    bash "$SCRIPT_DIR/backup.sh" "pre-rebuild"
  else
    echo "Step 1/4: backup skipped (db not running — nothing to back up)"
  fi
else
  echo "Step 1/4: backup skipped (--no-backup)"
fi

echo "Step 2/4: stopping stack and removing volumes (this wipes the DB)"
docker compose down -v

echo "Step 3/4: rebuilding images"
docker compose build

echo "Step 4/4: starting stack"
docker compose up -d

echo "Done. Watch logs with: docker compose logs -f api"
echo "To restore the data you just dumped:"
echo "  ./scripts/restore.sh ./backups/assethub_pre-rebuild_<timestamp>.sql"
