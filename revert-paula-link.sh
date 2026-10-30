#!/usr/bin/env bash
# Local one-action revert for Paula's live preplist-sorter (same idea as
# .github/workflows/revert-to-backup.yml). Creates a NEW commit on master;
# never force-pushes.
set -euo pipefail
TAG="${1:-backup-pre-sortedexport-20261030}"
MODE="${2:-restore}"   # restore | restore-latest
REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-master}"

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

git fetch "$REMOTE" --tags
git fetch "$REMOTE" "$BRANCH"

if [ "$MODE" = "restore-latest" ]; then
  REF="live-backup-4.4.4"
else
  REF="$TAG"
fi

if git rev-parse --verify "refs/tags/${REF}" >/dev/null 2>&1; then
  SHA=$(git rev-parse "refs/tags/${REF}")
elif git rev-parse --verify "${REMOTE}/${REF}" >/dev/null 2>&1; then
  SHA=$(git rev-parse "${REMOTE}/${REF}")
elif git rev-parse --verify "${REF}" >/dev/null 2>&1; then
  SHA=$(git rev-parse "${REF}")
else
  echo "Could not resolve restore ref: ${REF}" >&2
  exit 1
fi

echo "Restoring full tree from ${REF} (${SHA}) onto ${BRANCH} as a new commit..."
CUR=$(git rev-parse --abbrev-ref HEAD)
git checkout "$BRANCH"
git pull --ff-only "$REMOTE" "$BRANCH" || true
# Full replace so files added after the backup are removed
git rm -rf -q .
git checkout "${SHA}" -- .
if git diff --cached --quiet; then
  echo "Already matches ${REF}; nothing to do."
  git checkout "$CUR" 2>/dev/null || true
  exit 0
fi
git -c user.name=Autoprod -c user.email=autoprod.help@gmail.com \
  commit -m "Revert live to ${REF} (${SHA:0:7}) via local script (no force)."
git push "$REMOTE" "HEAD:${BRANCH}"
echo "Pushed $(git rev-parse --short HEAD). Switch back: git checkout ${CUR}"
