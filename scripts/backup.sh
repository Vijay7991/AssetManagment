#!/usr/bin/env bash
# Dumps the AssetHub Postgres database into ./backups/ with a timestamped
# filename. Safe to run any time — pg_dump is read-only and won't lock
# anything the app cares about.
#
# Usage:
#   ./scripts/backup.sh             # → ./backups/assethub_2026-05-16_14-30-00.sql
#   ./scripts/backup.sh nightly     # → ./backups/assethub_nightly_2026-05-16_14-30-00.sql

set -euo pipefail

# Resolve the project root regardless of where the script is invoked from so
# Docker compose finds the right .env / compose file.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Load env so we know the user + db names. .env is the canonical source — fall
# back to the values baked into .env.example if it's missing.
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
fi
DB_USER="${POSTGRES_USER:-assethub}"
DB_NAME="${POSTGRES_DB:-assethub}"
TAG="${1:-}"

BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
if [[ -n "$TAG" ]]; then
  OUT="$BACKUP_DIR/assethub_${TAG}_${TIMESTAMP}.sql"
else
  OUT="$BACKUP_DIR/assethub_${TIMESTAMP}.sql"
fi

# Confirm the db container is actually running — pg_dump against a stopped
# container produces a confusing error.
if ! docker compose ps db --status running --quiet | grep -q .; then
  echo "ERROR: the 'db' service isn't running. Start it with: docker compose up -d db" >&2
  exit 1
fi

echo "Dumping $DB_NAME → $OUT"
docker compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists > "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo "Done. Backup is $SIZE."
echo "$OUT"
