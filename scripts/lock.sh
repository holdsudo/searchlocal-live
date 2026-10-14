# Sourced by the automation scripts: one run at a time, so two jobs never commit/push together.
# Waits up to 30 minutes for the other job; a lock older than 2 hours is treated as stale.
LOCK="$REPO/automation/.lock"
GOT_LOCK=""
for _ in $(seq 1 180); do
  if mkdir "$LOCK" 2>/dev/null; then GOT_LOCK=1; trap 'rmdir "$LOCK" 2>/dev/null' EXIT; break; fi
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then rmdir "$LOCK" 2>/dev/null; continue; fi
  sleep 10
done
[ -n "$GOT_LOCK" ] || { echo "Another SearchLocal job is still running; giving up."; exit 1; }
