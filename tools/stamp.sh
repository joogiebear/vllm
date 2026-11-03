#!/bin/sh
# Stamps one release id onto every module path, so a browser never mixes old
# and new files after an update. Run before each push: sh tools/stamp.sh
set -e
cd "$(dirname "$0")/.."
V=$(date -u +%Y%m%d%H%M%S)
for f in src/idle/*.js src/*.js; do
  sed -i -E "s#(from '\./[A-Za-z0-9_./-]+\.js)(\?v=[0-9]+)?'#\1?v=$V'#g" "$f"
done
for f in index.html rush.html; do
  sed -i -E "s#(src=\"src/[A-Za-z0-9_./-]+\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#g" "$f"
done
echo "stamped $V"
