#!/bin/bash
# War Library — Daily data backup
# Keeps last 7 days of event data backups
BACKUP_DIR=/opt/backups/warlibrary
DATA_DIR=/opt/warlibrary/src/data
DATE=$(date +%Y-%m-%d_%H%M)

mkdir -p $BACKUP_DIR
cp $DATA_DIR/events.json $BACKUP_DIR/events_$DATE.json
cp $DATA_DIR/events_expanded.json $BACKUP_DIR/events_expanded_$DATE.json
cp $DATA_DIR/events_latest.json $BACKUP_DIR/events_latest_$DATE.json

# Keep only last 7 days (21 files = 3 files x 7 days)
ls -t $BACKUP_DIR/events_latest_*.json 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null
ls -t $BACKUP_DIR/events_expanded_*.json 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null
ls -t $BACKUP_DIR/events_*.json 2>/dev/null | grep -v expanded | grep -v latest | tail -n +8 | xargs rm -f 2>/dev/null

echo "[$(date)] Backup complete: $BACKUP_DIR/events_latest_$DATE.json"
