#!/bin/bash
# War Library — newsletter cron wrapper
#
# Usage: scripts/newsletter.sh sweep|status [extra args for newsletter.js]
#
# Cron on the droplet (UTC), beside the dispatch lines:
#   15 * * * *  /opt/warlibrary/scripts/newsletter.sh sweep >> /var/log/warlibrary-dispatch.log 2>&1
#
# The hourly sweep is what emails a weekly or monthly dispatch that went
# live on its own 24 h after generation. dispatch.sh also runs a sweep
# right after the daily writer so the morning email leaves at 06:00.
# The lock keeps those two from racing.

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

CMD="${1:-sweep}"
shift || true

cd "$PROJECT_DIR"

LOCKFILE="/tmp/warlibrary-newsletter.lock"
exec 8>"$LOCKFILE"
if ! flock -w 300 8; then
  log "Another newsletter run holds the lock; giving up after 300 s."
  exit 0
fi

set +e
OUTPUT=$("$NODE_BIN" scripts/newsletter.js "$CMD" "$@" 2>&1)
RC=$?
set -e
echo "$OUTPUT" | while IFS= read -r line; do log "  [newsletter] $line"; done
if [ "$RC" -ne 0 ]; then
  log "ERROR: newsletter.js exited $RC"
  exit "$RC"
fi
