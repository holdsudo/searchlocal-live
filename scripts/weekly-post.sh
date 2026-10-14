#!/bin/bash
# Publishes one blog post on searchlocal.live. Run by LaunchAgent com.searchlocal.weekly-post
# (Wednesdays 11:00). Missed runs (Mac asleep) fire on next wake. Safe to run by hand.
# DRY_RUN=1 bash scripts/weekly-post.sh  -> writes and checks a draft, builds, then reverts; nothing is pushed.
set -uo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
REPO="$HOME/searchlocal-live"
LOG="$REPO/automation/logs/$(date +%F)-post.log"
mkdir -p "$REPO/automation/logs"
exec >>"$LOG" 2>&1
echo "=== $(date) ${DRY_RUN:+(dry run)} ==="
cd "$REPO" || exit 1
source scripts/lock.sh

notify() { osascript -e "display notification \"$1\" with title \"SearchLocal blog\"" >/dev/null 2>&1 || true; }

# Never run on top of uncommitted manual edits.
if [ -n "$(git status --porcelain -- src build.mjs)" ]; then
  echo "Uncommitted changes in src/ or build.mjs; skipping this run."; notify "Weekly post skipped: uncommitted changes"; exit 0
fi
export GH_TOKEN="$(gh auth token --user holdsudo)"
[ -n "${DRY_RUN:-}" ] || git -c credential.helper= -c "credential.helper=!f(){ echo username=holdsudo; echo password=$GH_TOKEN; }; f" pull -q --ff-only origin main || { echo "pull failed"; exit 1; }

node scripts/pick-topic.mjs; rc=$?
if [ $rc -eq 2 ]; then notify "No fresh blog topic this week (need more new listings)"; exit 0; fi
[ $rc -eq 0 ] || { notify "Weekly post failed: could not pick a topic"; exit 1; }

# One retry: if the checker rejects the first draft, the agent gets the reasons and rewrites it.
for attempt in 1 2; do
  rm -f automation/post-draft.html
  PROMPT="$(cat automation/post-prompt.md)"
  [ -n "${REJECTED:-}" ] && PROMPT="$PROMPT

Your previous draft was rejected by the checker for these reasons. Fix every one:
$REJECTED"
  claude -p "$PROMPT" \
    --model sonnet \
    --allowedTools "WebFetch" "Read" "Edit(automation/post-draft.html)" \
    --max-turns 40 </dev/null >/dev/null
  [ -f automation/post-draft.html ] || { echo "agent wrote no draft"; continue; }
  REJECTED="$(node scripts/apply-post.mjs 2>&1)" && { echo "$REJECTED"; REJECTED=""; break; }
  echo "attempt $attempt: $REJECTED"
done
if [ -n "${REJECTED:-}" ] || [ -z "$(git status --porcelain -- src/posts)" ]; then
  notify "Weekly post failed the checks (see log)"; exit 1
fi

node build.mjs || { git checkout -- src; git clean -fdq src/posts; notify "Weekly post: build failed, reverted"; exit 1; }
NEW=$(git status --porcelain -- src/posts | awk '{print $2}')
TITLE=$(node -e 'const s=require("fs").readFileSync(process.argv[1],"utf8");console.log(JSON.parse(s.match(/^<!--([\s\S]*?)-->/)[1]).title)' "$NEW")

if [ -n "${DRY_RUN:-}" ]; then
  cp "$NEW" automation/last-dry-run.html
  git checkout -- src; git clean -fdq src/posts
  echo "Dry run OK: $TITLE (kept at automation/last-dry-run.html)"; exit 0
fi

git add src/posts src/data/lastmod.json
git -c user.name=holdsudo -c user.email="holdsudo@users.noreply.github.com" commit -q -m "Blog: $TITLE

Automated weekly post (scripts/weekly-post.sh)." || { echo "nothing to commit"; exit 0; }
git -c credential.helper= -c "credential.helper=!f(){ echo username=holdsudo; echo password=$GH_TOKEN; }; f" push -q origin main || { notify "Weekly post: push failed"; exit 1; }
echo "Published: $TITLE"
notify "Published: $TITLE"
