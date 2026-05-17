#!/usr/bin/env bash
# Applies the data-preserving SQL migration against the running db container.
# Use this when a release adds new columns/tables and you want to keep all
# existing data (assets, members, etc.) — no `down -v` required.
#
# Usage:
#   ./scripts/migrate.sh
#   ./scripts/migrate.sh ./scripts/migrate-2026-05-units.sql --yes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

FILE="${1:-$SCRIPT_DIR/migrate-2026-05-units.sql}"
SKIP_BACKUP=""
if [[ "${2:-}" == "--no-backup" ]]; then SKIP_BACKUP=1; fi

if [[ ! -f "$FILE" ]]; then
  echo "ERROR: migration file not found: $FILE" >&2
  exit 1
fi

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
fi
DB_USER="${POSTGRES_USER:-assethub}"
DB_NAME="${POSTGRES_DB:-assethub}"

if ! docker compose ps db --status running --quiet | grep -q .; then
  echo "ERROR: the 'db' service isn't running. Start it first: docker compose up -d db" >&2
  exit 1
fi

if [[ -z "$SKIP_BACKUP" ]]; then
  echo "Backing up first (use --no-backup to skip)..."
  bash "$SCRIPT_DIR/backup.sh" "pre-migrate"
fi

echo
echo "Applying migration: $FILE"
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" --set ON_ERROR_STOP=1 < "$FILE"

echo
echo "Migration applied. Restarting the API so it picks up the new schema..."
docker compose restart api > /dev/null

echo "Done. Tail the logs to confirm a clean start:"
echo "  docker compose logs -f api"
