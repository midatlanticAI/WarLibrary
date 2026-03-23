#!/bin/bash

# War Library - Auto Update Script
#
# Runs the Node.js event update script to append new events to
# events_latest.json. The API route reads from disk on each request,
# so no rebuild or PM2 restart is needed — new events appear within 60s.
#
# Usage:
#   ./scripts/auto-update.sh
#
# Cron (every 10 minutes):
#   */10 * * * * /opt/warlibrary/scripts/auto-update.sh >> /var/log/warlibrary-updates.log 2>&1

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PROJECT_DIR="/opt/warlibrary"
NODE_BIN="/usr/bin/node"

# Use nvm node if available
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh"
  NODE_BIN="$(which node)"
fi

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
log "=========================================="
log "War Library Auto-Update Starting"
log "=========================================="

cd "$PROJECT_DIR"

# Prevent overlapping runs (flock on the script itself)
LOCKFILE="/tmp/warlibrary-update.lock"
exec 9>"$LOCKFILE"
if ! flock -n 9; then
  log "Another update is already running. Skipping."
  exit 0
fi

# Run the update script and capture output
log "Running event update script..."
UPDATE_OUTPUT=$("$NODE_BIN" scripts/update-events.js 2>&1) || {
  log "ERROR: Update script failed with exit code $?"
  log "Output: $UPDATE_OUTPUT"
  exit 1
}

echo "$UPDATE_OUTPUT" | while IFS= read -r line; do
  log "  [update] $line"
done

# Log status (no rebuild needed — API reads from disk)
if echo "$UPDATE_OUTPUT" | grep -q "STATUS: EVENTS_ADDED"; then
  EVENTS_COUNT=$(echo "$UPDATE_OUTPUT" | grep "STATUS: EVENTS_ADDED" | sed 's/.*EVENTS_ADDED=//')
  log "New events added: $EVENTS_COUNT (live within 60s, no rebuild needed)"
elif echo "$UPDATE_OUTPUT" | grep -q "STATUS: NO_NEW_EVENTS"; then
  log "No new events found."
else
  log "WARNING: Could not determine update status from script output."
fi

log "Auto-update complete."
log "=========================================="
