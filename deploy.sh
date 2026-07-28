#!/bin/bash
# War Library — one-command deploy to production
# Usage: bash deploy.sh

set -e
# pipefail matters for the archive guard below: without it, the guard's exit
# status is grep's alone, so a failing `tar tzf` would read as "nothing found"
# and the deploy would proceed having verified nothing.
set -o pipefail

SERVER="${DEPLOY_SERVER:-root@your-server-ip}"
REMOTE_PATH="/opt/warlibrary"
ARCHIVE="/tmp/warlibrary.tar.gz"

echo "=== War Library Deploy ==="
echo ""

# 1. Verify locally first to catch errors.
#
# This gates on CODE, not on data. The data-integrity suite validates
# src/data/events_latest.json — a server-owned file that this script explicitly
# refuses to deploy (see the excludes below). Gating a code deploy on the
# contents of a file that is never deployed means one bad row on the operator's
# machine blocks every deploy, so that suite is excluded here.
#
# Production data still gets validated — against the live dataset, on the
# server, where it actually lives. Run: npm run test:data
echo "[1/5] Verifying locally (test + build)..."
npx vitest run --exclude '**/data-integrity.test.ts'
npm run build
echo "  ✓ Tests and build passed"

# 2. Package (exclude secrets, node_modules, build artifacts, and ALL server-owned
#    runtime data — these files live only on the droplet and are mutated by the
#    pipeline and the app. Shipping local copies would overwrite production data.
#    Keep this list in sync with the "runtime data" block in .gitignore.)
echo "[2/5] Packaging..."
tar \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='coverage' \
  --exclude='test-results' \
  --exclude='playwright-report' \
  --exclude='push-subscriptions.json' \
  --exclude='*.tmp' \
  --exclude='src/data/events_latest.json' \
  --exclude='src/data/article-url-cache.json' \
  --exclude='src/data/pipeline-history.json' \
  --exclude='src/data/pipeline-stats.json' \
  --exclude='src/data/analytics.json' \
  --exclude='src/data/notification.json' \
  --exclude='src/data/dedup-log.json' \
  --exclude='src/data/quarantine-duplicates.json' \
  --exclude='src/data/*.backup-*.json' \
  -czf "$ARCHIVE" .
echo "  ✓ Packaged"

# 2b. Fail loudly if any server-owned runtime file slipped into the archive.
echo "[2b/5] Verifying archive contains no runtime data..."
if tar tzf "$ARCHIVE" | grep -E '(events_latest|article-url-cache|pipeline-history|pipeline-stats|analytics|notification|dedup-log|quarantine-duplicates)\.json|\.backup-.*\.json|push-subscriptions\.json|\.env($|\.)'; then
  echo "  ✗ ABORT: archive contains server-owned runtime data (listed above)."
  echo "    Deploying it would overwrite production. Fix the --exclude list."
  rm -f "$ARCHIVE"
  exit 1
fi
echo "  ✓ No runtime data in archive"

# 3. Upload
echo "[3/5] Uploading to $SERVER..."
scp "$ARCHIVE" "$SERVER:$REMOTE_PATH.tar.gz"
rm "$ARCHIVE"
echo "  ✓ Uploaded"

# 4. Build on server
echo "[4/5] Building on server..."
ssh "$SERVER" "cd $REMOTE_PATH && tar xzf $REMOTE_PATH.tar.gz && rm $REMOTE_PATH.tar.gz && npm install --production=false 2>&1 | tail -1 && npm run build 2>&1 | tail -3"
echo "  ✓ Built"

# 5. Restart
echo "[5/5] Restarting..."
ssh "$SERVER" "pm2 restart warlibrary"
echo "  ✓ Restarted"

echo ""
echo "=== Deployed to https://warlibrary.midatlantic.ai ==="
