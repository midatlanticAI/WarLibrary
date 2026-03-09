#!/bin/bash
# War Library — one-command deploy to production
# Usage: bash deploy.sh

set -e

SERVER="${DEPLOY_SERVER:-root@your-server-ip}"
REMOTE_PATH="/opt/warlibrary"
ARCHIVE="/tmp/warlibrary.tar.gz"

echo "=== War Library Deploy ==="
echo ""

# 1. Build locally first to catch errors
echo "[1/5] Building locally..."
npm run build
echo "  ✓ Build passed"

# 2. Package (exclude secrets, node_modules, build artifacts)
echo "[2/5] Packaging..."
tar --exclude='node_modules' --exclude='.next' --exclude='.env.local' -czf "$ARCHIVE" .
echo "  ✓ Packaged"

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
