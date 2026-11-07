#!/usr/bin/env bash
# Guard for index.html: if a pushed index.html is missing the required safeguards
# (e.g. an old copy was uploaded by hand), restore the newest earlier version that has them.
set -euo pipefail

has_safeguards() {
  local f; f="$(mktemp)"; cat > "$f"
  grep -qE 'const CFG = \{ url: "https://(bporqhbfwhvuzfdxfrbi\.supabase\.co|api\.shirinkadeh-paris\.ir)"' "$f" \
    && grep -q '__sbReady' "$f" \
    && grep -q 'Mobile layout: the story section' "$f"
}

if has_safeguards < index.html; then
  echo "index.html has all required safeguards - nothing to do."
  exit 0
fi

echo "index.html is missing required safeguards; looking for the last good version..."
for sha in $(git log --format=%H -n 300 -- index.html | tail -n +2); do
  if git show "$sha:index.html" | has_safeguards; then
    echo "Restoring index.html from $sha"
    git show "$sha:index.html" > index.html
    if [ "${GUARD_DRY:-}" = "1" ]; then echo "(dry run: not committing)"; exit 0; fi
    git config user.name "index-guard[bot]"
    git config user.email "index-guard@users.noreply.github.com"
    git add index.html
    git commit -m "Guard: restore index.html from ${sha:0:7} (the pushed version was missing required safeguards). Use [skip-guard] in a commit message to bypass."
    git push || { git pull --rebase origin main && git push; }
    exit 0
  fi
done
echo "No earlier good version of index.html was found." >&2
exit 1
