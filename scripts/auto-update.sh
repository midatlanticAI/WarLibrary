#!/bin/bash

# War Library - Auto Update Script
#
# Runs the Node.js event update script, and if new events were added,
# rebuilds the Next.js app and restarts PM2.
#
# Usage:
#   ./scripts/auto-update.sh          # Normal run
#   ./scripts/auto-update.sh --force  # Force rebuild even if no new events
#
# Cron (every 10 minutes):
#   */10 * * * * /opt/warlibrary/scripts/auto-update.sh >> /var/log/warlibrary-updates.log 2>&1

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PROJECT_DIR="/opt/warlibrary"
LOG_FILE="/var/log/warlibrary-updates.log"
NODE_BIN="/usr/bin/node"
NPM_BIN="/usr/bin/npm"
PM2_BIN="/usr/bin/pm2"

# Use nvm node if available
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh"
  NODE_BIN="$(which node)"
  NPM_BIN="$(which npm)"
  PM2_BIN="$(which pm2 2>/dev/null || echo '/usr/bin/pm2')"
fi

FORCE_REBUILD=false
if [ "${1:-}" = "--force" ]; then
  FORCE_REBUILD=true
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

# Check if new events were added
NEEDS_REBUILD=false
if echo "$UPDATE_OUTPUT" | grep -q "STATUS: EVENTS_ADDED"; then
  EVENTS_COUNT=$(echo "$UPDATE_OUTPUT" | grep "STATUS: EVENTS_ADDED" | sed 's/.*EVENTS_ADDED=//')
  log "New events detected: $EVENTS_COUNT"
  NEEDS_REBUILD=true
elif echo "$UPDATE_OUTPUT" | grep -q "STATUS: NO_NEW_EVENTS"; then
  log "No new events found."
else
  log "WARNING: Could not determine update status from script output."
fi

if [ "$FORCE_REBUILD" = true ]; then
  log "Force rebuild requested."
  NEEDS_REBUILD=true
fi

# Rebuild and restart if needed
if [ "$NEEDS_REBUILD" = true ]; then
  log "Rebuilding Next.js application..."

  BUILD_OUTPUT=$("$NPM_BIN" run build 2>&1) || {
    log "ERROR: Build failed!"
    log "Build output: $BUILD_OUTPUT"
    exit 1
  }
  log "Build completed successfully."

  log "Restarting PM2 process..."
  if "$PM2_BIN" list 2>/dev/null | grep -q "warlibrary\|frontend\|next"; then
    "$PM2_BIN" restart all 2>&1 | while IFS= read -r line; do
      log "  [pm2] $line"
    done
    log "PM2 restarted successfully."
  else
    log "WARNING: No PM2 process found matching warlibrary/frontend/next."
    log "You may need to start the app manually: pm2 start npm --name warlibrary -- start"
  fi
else
  log "No rebuild needed. Skipping."
fi

log "Auto-update complete."
log "=========================================="
