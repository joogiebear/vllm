#!/bin/sh
# Release gate (docs/STABILITY-DESIGN.md, section 1, build task 3).
# Runs the checks in order and stops at the first failure with a clear
# message. Nothing reaches GitHub Pages unless every check passes.
set -e
cd "$(dirname "$0")/.."

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

echo "==> [1/5] stamp"
STAMP_OUT=$(sh tools/stamp.sh) || fail "stamp.sh failed"
STAMP_ID=${STAMP_OUT#stamped }

echo "==> [2/5] node --test test/"
node --test test/ || fail "tests failed"

echo "==> [3/5] import check"
node tools/check-imports.js || fail "import check failed"

echo "==> [4/5] smoke"
node tools/smoke.js || fail "smoke test failed"

echo "==> [5/5] commit the stamp"
git add -A || fail "git add failed"
if git diff --cached --quiet; then
  echo "stamp unchanged; nothing to commit"
else
  git commit -m "build: stamp release $STAMP_ID" || fail "git commit failed"
fi

echo "checks passed"
if git remote get-url origin >/dev/null 2>&1; then
  git push || fail "git push failed"
else
  echo "checks passed; push from a machine with GitHub access"
  exit 0
fi
