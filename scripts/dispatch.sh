#!/bin/bash
# War Library — dispatch cron wrapper
#
# Usage: scripts/dispatch.sh daily|weekly|monthly [extra args for write-dispatch.js]
#
# Cron on the droplet (UTC):
#   0  6 * * *  /opt/warlibrary/scripts/dispatch.sh daily   >> /var/log/warlibrary-dispatch.log 2>&1
#   30 6 * * 1  /opt/warlibrary/scripts/dispatch.sh weekly  >> /var/log/warlibrary-dispatch.log 2>&1
#   0  7 1 * *  /opt/warlibrary/scripts/dispatch.sh monthly >> /var/log/warlibrary-dispatch.log 2>&1

set -euo pipefail

PROJECT_DIR="/opt/warlibrary"
NODE_BIN="/usr/bin/node"
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh"
  NODE_BIN="$(which node)"
fi

log() { echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] $*"; }

KIND="${1:-}"
case "$KIND" in
  daily|weekly|monthly) ;;
  *) log "usage: dispatch.sh daily|weekly|monthly"; exit 2 ;;
esac
shift

cd "$PROJECT_DIR"

LOCKFILE="/tmp/warlibrary-dispatch.lock"
exec 9>"$LOCKFILE"
if ! flock -w 120 9; then
  log "Another dispatch writer is running; giving up after 120 s."
  exit 0
fi

log "=== dispatch $KIND starting ==="
set +e
OUTPUT=$("$NODE_BIN" scripts/write-dispatch.js --kind "$KIND" "$@" 2>&1)
RC=$?
set -e
echo "$OUTPUT" | while IFS= read -r line; do log "  [dispatch] $line"; done
if [ "$RC" -ne 0 ]; then
  log "ERROR: write-dispatch.js exited $RC"
  exit "$RC"
fi
log "=== dispatch $KIND done ==="
