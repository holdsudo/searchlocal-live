#!/bin/bash
# Adds one verified business to searchlocal.live. Run by LaunchAgent com.searchlocal.weekly-add
# (daily at 10:00). Missed runs (Mac asleep) fire on next wake. Safe to run by hand.
set -uo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
REPO="$HOME/searchlocal-live"
LOG="$REPO/automation/logs/$(date +%F).log"
mkdir -p "$REPO/automation/logs"
exec >>"$LOG" 2>&1
echo "=== $(date) ==="
cd "$REPO" || exit 1
source scripts/lock.sh

notify() { osascript -e "display notification \"$1\" with title \"SearchLocal\"" >/dev/null 2>&1 || true; }

# Never run on top of uncommitted manual edits.
if [ -n "$(git status --porcelain -- src build.mjs)" ]; then
  echo "Uncommitted changes in src/ or build.mjs; skipping this run."; notify "Weekly add skipped: uncommitted changes"; exit 0
fi
export GH_TOKEN="$(gh auth token --user holdsudo)"
git -c credential.helper= -c "credential.helper=!f(){ echo username=holdsudo; echo password=$GH_TOKEN; }; f" pull -q --ff-only origin main || { echo "pull failed"; exit 1; }

node scripts/pick-candidates.mjs 6 || { notify "Weekly add failed: could not pick candidates"; exit 1; }
rm -f automation/result.json

claude -p "$(cat automation/verify-prompt.md)" \
  --model sonnet \
  --allowedTools "WebFetch" "Read" "Edit(automation/result.json)" \
  --max-turns 40 </dev/null >/dev/null
[ -f automation/result.json ] || { echo "agent wrote no result"; notify "Weekly add failed: no result from verifier"; exit 1; }
cat automation/result.json

node scripts/apply-candidate.mjs; rc=$?
if [ $rc -eq 1 ]; then notify "Weekly add failed (see log)"; exit 1; fi

node build.mjs || { git checkout -- src; notify "Weekly add: build failed, reverted"; exit 1; }
git add src/data
if [ $rc -eq 0 ]; then
  NAME=$(node -e 'const l=require("./src/data/listings.json");console.log(l[l.length-1].name)')
  MSG="Add listing: $NAME"
else
  NAME=""; MSG="Record checked candidates (none added)"
fi
git -c user.name=holdsudo -c user.email="holdsudo@users.noreply.github.com" commit -q -m "$MSG

Automated weekly add (scripts/weekly-add.sh)." || { echo "nothing to commit"; exit 0; }
git -c credential.helper= -c "credential.helper=!f(){ echo username=holdsudo; echo password=$GH_TOKEN; }; f" push -q origin main || { notify "Weekly add: push failed"; exit 1; }
echo "$MSG"
[ -n "$NAME" ] && notify "Added $NAME" || notify "No business passed checks this run"
