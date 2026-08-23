#!/usr/bin/env bash
# Runs prove-cycle only for combos actually touched by this branch, so a pre-push hook stays
# fast on unrelated changes instead of forcing a full Postgres cycle in all 4 combos every time.
#
# Diffs against origin/main so a feature branch is judged by what it actually changed; falls
# back to HEAD's last commit when there is no origin/main to compare against (e.g. no remote
# configured yet), so this still works in a fresh local clone.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

COMBOS=(nestjs-prisma nestjs-drizzle express-prisma express-drizzle)

if git rev-parse --verify --quiet origin/main >/dev/null; then
  DIFF="$(git diff --name-only origin/main...HEAD)"
else
  DIFF="$(git diff --name-only HEAD)"
fi

# registry/core/ is the shared foundation every combo structurally depends on — a core-only
# diff must not silently skip every combo's prove-cycle.
CORE_CHANGED=false
if echo "$DIFF" | grep -q '^registry/core/'; then
  CORE_CHANGED=true
fi

TO_RUN=()
for combo in "${COMBOS[@]}"; do
  if $CORE_CHANGED; then
    echo "prove-changed: running $combo (registry/core/ changed, affects all combos)"
    TO_RUN+=("$combo")
  elif echo "$DIFF" | grep -q "^registry/combos/$combo/"; then
    echo "prove-changed: running $combo (changed directly)"
    TO_RUN+=("$combo")
  fi
done

if [ ${#TO_RUN[@]} -eq 0 ]; then
  echo "prove-changed: no combo changes detected, nothing to prove"
  exit 0
fi

for combo in "${TO_RUN[@]}"; do
  (cd "registry/combos/$combo" && npm run prove-cycle)
done
