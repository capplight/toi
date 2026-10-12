#!/usr/bin/env bash
# RA Л3 — restore a backup made by .github/workflows/backup.yml and check it (plan 9, 14; docs/RUNBOOK.md).
#
#   scripts/restore.sh <backup.dump.age | backup.dump> <target-database-url> [--identity <age-key.txt>] [--compare <source-url>]
#
# Target: an EMPTY database — a new Neon branch (Neon console → Branches → New branch, empty/«schema only» is fine
# as long as it has no tables of ours) or a local Postgres / PGlite (`pnpm db:local --port 5436`). Never production.
# Steps:
#   1. decrypt with the age private key (kept by the founder outside the repository) when the file ends in .age;
#   2. pg_restore --no-owner --no-privileges into the target (exit on the first error);
#   3. check: every table whose data is in the dump exists in the target and has a row count; with --compare,
#      the counts must equal the source (e.g. production at the time of the dump — only right after the dump).
# Needs pg_restore and psql (same or newer major than the dump), and age for .age files.
set -euo pipefail

usage() {
  sed -n '2,15p' "$0" >&2
  exit 2
}

[ $# -ge 2 ] || usage
FILE=$1
TARGET=$2
shift 2
IDENTITY=""
COMPARE=""
while [ $# -gt 0 ]; do
  case $1 in
    --identity) IDENTITY=$2; shift 2 ;;
    --compare) COMPARE=$2; shift 2 ;;
    *) usage ;;
  esac
done

case $TARGET in
  *prod*|*production*) echo "restore: the target URL looks like production — refusing" >&2; exit 1 ;;
esac

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
DUMP=$FILE
if [[ $FILE == *.age ]]; then
  [ -n "$IDENTITY" ] || { echo "restore: .age file needs --identity <age-key.txt>" >&2; exit 1; }
  DUMP="$WORK/backup.dump"
  age --decrypt --identity "$IDENTITY" --output "$DUMP" "$FILE"
fi

# Tables whose data is in the dump (schema.table), from the archive's table of contents.
pg_restore --list "$DUMP" | awk '$4 == "TABLE" && $5 == "DATA" { print $6 "." $7 }' | sort -u > "$WORK/tables"
echo "restore: $(wc -l < "$WORK/tables") tables with data in $(basename "$FILE")"

existing=$(psql "$TARGET" -At -v ON_ERROR_STOP=1 -c "select count(*) from information_schema.tables where table_schema = 'public'")
if [ "$existing" != "0" ]; then
  echo "restore: the target already has $existing tables in public — use an empty database / new branch" >&2
  exit 1
fi

pg_restore --no-owner --no-privileges --exit-on-error --dbname="$TARGET" "$DUMP"
echo "restore: pg_restore done"

count() { psql "$1" -At -v ON_ERROR_STOP=1 -c "select count(*) from \"${2%%.*}\".\"${2#*.}\""; }
fail=0
printf '%-36s %10s %10s\n' table restored source
while read -r t; do
  [ -n "$t" ] || continue
  if ! n=$(count "$TARGET" "$t" 2>/dev/null); then
    printf '%-36s %10s\n' "$t" MISSING
    fail=1
    continue
  fi
  if [ -n "$COMPARE" ]; then
    s=$(count "$COMPARE" "$t")
    mark=""
    [ "$n" = "$s" ] || { mark="  ≠"; fail=1; }
    printf '%-36s %10s %10s%s\n' "$t" "$n" "$s" "$mark"
  else
    printf '%-36s %10s\n' "$t" "$n"
  fi
done < "$WORK/tables"

if [ $fail -ne 0 ]; then
  echo "restore: CHECK FAILED" >&2
  exit 1
fi
echo "restore: OK"
