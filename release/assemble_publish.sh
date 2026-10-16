#!/usr/bin/env bash
# Assemble the PUBLIC publish set for the Prepline Pro live release from this branch's committed HEAD.
#   release/assemble_publish.sh plain     <outdir>   # Option A: what master would hold (readable index.html), = today's layout
#   release/assemble_publish.sh protected <outdir>   # Option B: minified 'site' build (copy-protect tooling), for a private -src repo + public 'site' branch
# Both start from the live master tree (tag live-backup-2026-10-08-pre-pro-live) so the free offline download,
# vendor files, icons, robots.txt etc. stay exactly as they are today, then overlay the changed web files.
# The paid Prepline-Pro-* files are never copied. Nothing is committed or pushed.
# The GoatCounter visitor counter (release/goatcounter.json, release/add_goatcounter.py) is added HERE, to this
# live public set only; the source index.html, the test site, the team edition and the offline zips never get it.
set -euo pipefail
MODE=${1:?plain|protected}; OUT=${2:?outdir}
ROOT=$(cd "$(dirname "$0")/.." && pwd); TAG=live-backup-2026-10-08-pre-pro-live; PREV_TAG=live-v3.4.9-r6   # PREV_TAG = the free live site being replaced (3.4.9-r6, which itself keeps 3.4.8 in previous/)
[ -z "$(git -C "$ROOT" status --porcelain -- index.html privacy.html terms.html refunds.html sw.js VERSION sitemap.xml release/goatcounter.json release/goatcounter release/add_goatcounter.py)" ] || { echo "commit the web files first"; exit 1; }
WEB="index.html privacy.html terms.html refunds.html sw.js VERSION sitemap.xml manifest.webmanifest robots.txt icons"
STAGE=$(mktemp -d); trap 'rm -rf "$STAGE"' EXIT
git -C "$ROOT" archive "$TAG" | tar -x -C "$STAGE"
git -C "$ROOT" archive HEAD $WEB | tar -x -C "$STAGE"
rm -f "$STAGE"/dist/Prepline-Pro-*
# previous/ = the free live site that Pro replaces, so the always-visible "Revert to previous version" button has a target
# (its own previous/ keeps the 3.4.8 chain). Added after the build step so it is copied byte-for-byte, not minified.
PREVDIR=$(mktemp -d); git -C "$ROOT" archive "$PREV_TAG" | tar -x -C "$PREVDIR"; rm -rf "$PREVDIR"/dist
[ -f "$PREVDIR/index.html" ] && [ -f "$PREVDIR/previous/index.html" ] || { echo "previous/ source tag $PREV_TAG is missing index.html or previous/"; exit 1; }
rm -rf "$STAGE"/previous
python3 "$ROOT/release/add_goatcounter.py" "$STAGE"
rm -rf "$OUT"; mkdir -p "$OUT"
if [ "$MODE" = plain ]; then
  cp -a "$STAGE"/. "$OUT"/
elif [ "$MODE" = protected ]; then
  TOOL=/workspace/copy-protect/tooling
  B=$(mktemp -d); cp -a "$STAGE"/. "$B"/; cp "$TOOL"/build.mjs "$TOOL"/LICENSE "$B"/; ln -s "$TOOL"/node_modules "$B"/node_modules
  mv "$B"/dist "$B"/_freedist   # build.mjs writes to ./dist; the free offline download is copied back byte-for-byte below
  KEEP=$(cd "$B" && find vendor -type f | sort | python3 -c 'import sys,json;print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')
  cat > "$B"/build.config.json <<JSON
{ "include": ["index.html","privacy.html","terms.html","refunds.html","sw.js","manifest.webmanifest","robots.txt","sitemap.xml","VERSION","icons","vendor"],
  "keep": $KEEP,
  "readme": "Prepline by Autoprod: built site files only. Copyright (c) 2026 Autoprod. All rights reserved." }
JSON
  echo '{"type":"module"}' > "$B"/package.json
  (cd "$B" && node build.mjs)
  cp -a "$B"/dist/. "$OUT"/; mkdir -p "$OUT"/dist; cp -a "$B"/_freedist/. "$OUT"/dist/; rm -rf "$B"
else echo "mode must be plain or protected"; exit 1; fi
cp -a "$PREVDIR" "$OUT"/previous; rm -rf "$PREVDIR"
echo "assembled $MODE publish set from $(git -C "$ROOT" rev-parse --short HEAD) ($(git -C "$ROOT" rev-parse --abbrev-ref HEAD)) -> $OUT"
