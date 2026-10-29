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
MANIFEST="/tmp/warlibrary.manifest"

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
# 1b. Refuse to ship shell scripts with Windows line endings. A CRLF shebang
#     makes cron on the droplet report "auto-update.sh: not found" and silently
#     stops the pipeline and the nightly backup (happened 2026-10-28).
#     .gitattributes pins *.sh to LF; this catches a checkout that predates it.
if grep -l $'\r' deploy.sh scripts/*.sh 2>/dev/null; then
  echo "  ✗ ABORT: the files above have CRLF line endings. Re-checkout them:"
  echo "    rm deploy.sh scripts/*.sh && git checkout -- deploy.sh scripts/"
  exit 1
fi
echo "  ✓ Shell scripts are LF"

echo "[2/5] Packaging..."
tar \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.cache' \
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
  --exclude='src/data/translations' \
  --exclude='src/data/newsletter.json' \
  --exclude='src/data/dispatches' \
  --owner=0 --group=0 \
  -czf "$ARCHIVE" .
echo "  ✓ Packaged"

# 2b. Fail loudly if any server-owned runtime file slipped into the archive.
echo "[2b/5] Verifying archive contains no runtime data..."
tar tzf "$ARCHIVE" > "$MANIFEST"
if grep -E '(events_latest|article-url-cache|pipeline-history|pipeline-stats|analytics|notification|dedup-log|quarantine-duplicates|newsletter)\.json|\.backup-.*\.json|push-subscriptions\.json|src/data/translations/|src/data/dispatches/|\.env($|\.)' "$MANIFEST"; then
  echo "  ✗ ABORT: archive contains server-owned runtime data (listed above)."
  echo "    Deploying it would overwrite production. Fix the --exclude list."
  rm -f "$ARCHIVE" "$MANIFEST"
  exit 1
fi
echo "  ✓ No runtime data in archive"

# 3. Upload the archive and its file list. The list lets the server step
#    retire files that were deleted from the repo: untarring over the old tree
#    never removes anything, which is how a deleted src/app/sitemap.ts stayed
#    behind and broke the build on 2026-10-28.
echo "[3/5] Uploading to $SERVER..."
scp "$ARCHIVE" "$SERVER:$REMOTE_PATH.tar.gz"
scp "$MANIFEST" "$SERVER:$REMOTE_PATH.manifest"
rm "$ARCHIVE" "$MANIFEST"
echo "  ✓ Uploaded"

# 4. Build on server. The whole step runs under set -e on the box, and the
#    build output goes to a log that is shown in full on failure — piping it
#    through `tail` used to hide the error and report a broken build as "Built".
#    The previous .next is kept aside and put back if the build fails, so a bad
#    deploy leaves the old build serving instead of taking the site down.
echo "[4/5] Building on server..."
ssh "$SERVER" "REMOTE_PATH=$REMOTE_PATH bash -s" <<'REMOTE'
set -euo pipefail
cd "$REMOTE_PATH"
tar xzf "$REMOTE_PATH.tar.gz"
rm "$REMOTE_PATH.tar.gz"

# Retire code files that are on the box but not in this release. Only source
# directories are considered and src/data/ is never touched (runtime data
# lives there). Nothing is deleted: stale files move to a dated folder.
find src public scripts -type f | sed 's#^#./#' | sort > /tmp/warlibrary.remote.list
grep -E '^\./(src|public|scripts)/' "$REMOTE_PATH.manifest" | sort > /tmp/warlibrary.shipped.list
rm "$REMOTE_PATH.manifest"
comm -13 /tmp/warlibrary.shipped.list /tmp/warlibrary.remote.list | grep -v '^\./src/data/' > /tmp/warlibrary.stale.list || true
if [ -s /tmp/warlibrary.stale.list ]; then
  dest="/opt/warlibrary-stale/$(date -u +%Y%m%dT%H%M%SZ)"
  while IFS= read -r f; do
    mkdir -p "$dest/$(dirname "$f")"
    mv "$f" "$dest/$f"
  done < /tmp/warlibrary.stale.list
  echo "  retired $(wc -l < /tmp/warlibrary.stale.list) file(s) no longer in the repo -> $dest"
  sed 's/^/    /' /tmp/warlibrary.stale.list
fi

npm install --production=false 2>&1 | tail -1

rm -rf .next.prev
[ -d .next ] && mv .next .next.prev
log="/root/build-$(date -u +%Y%m%dT%H%M%SZ).log"
set +e
NODE_OPTIONS=--max-old-space-size=1536 npm run build > "$log" 2>&1
rc=$?
set -e
if [ "$rc" -ne 0 ] || [ ! -f .next/BUILD_ID ]; then
  echo "  ✗ Server build failed (exit $rc). Full log: $log"
  echo "  --- last 40 lines ---"
  tail -40 "$log"
  rm -rf .next
  if [ -d .next.prev ]; then
    mv .next.prev .next
    echo "  previous build restored; the running site was not touched"
  fi
  exit 1
fi
rm -rf .next.prev
tail -3 "$log"
echo "  BUILD_ID $(cat .next/BUILD_ID)"
REMOTE
echo "  ✓ Built"

# 5. Restart and check it actually answers.
echo "[5/5] Restarting..."
ssh "$SERVER" "pm2 restart warlibrary --update-env > /dev/null && sleep 5 && curl -sf -o /dev/null -w 'health %{http_code}\n' http://127.0.0.1:3000/api/health"
echo "  ✓ Restarted"

echo ""
echo "=== Deployed to https://warlibrary.midatlantic.ai ==="
