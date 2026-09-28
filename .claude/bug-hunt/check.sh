#!/bin/bash
# Bug-hunt safety check: syntax-check changed server files, build the client,
# and boot the server on a throwaway data folder. Prints BUILD OK and
# SERVER BOOT OK; exits non-zero on any failure. Never touches the real data/.
ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
R=$ROOT/jobcard-system
S=${BUG_HUNT_SCRATCH:-${TMPDIR:-/tmp}/bug-hunt}
mkdir -p "$S"
fail=0
for f in $(git -C "$ROOT" diff --name-only HEAD -- 'jobcard-system/server/**.js' 'jobcard-system/server/*.js'); do
  [ -f "$ROOT/$f" ] && { node --check "$ROOT/$f" || fail=1; }
done
(cd "$R/client" && npx vite build --outDir "$S/build-check" > "$S/build.log" 2>&1) && echo "BUILD OK" || { echo "BUILD FAILED"; tail -20 "$S/build.log"; fail=1; }
PORT=$((4000 + RANDOM % 500))
# On the owner's WSL machine node_modules is shared with Windows, so the
# database module is a Windows build: boot with Windows Node (never rebuild).
if [ -f "$R/server/node_modules/better-sqlite3/build/Release/better_sqlite3.node" ] && ! head -c4 "$R/server/node_modules/better-sqlite3/build/Release/better_sqlite3.node" | grep -q ELF && command -v node.exe >/dev/null; then
  D=$(mktemp -d "$(wslpath "$(cmd.exe /c 'echo %TEMP%' 2>/dev/null | tr -d '\r')")/bughunt-XXXX")
  (cd "$R/server" && DATA_DIR="$(wslpath -w "$D")" PORT=$PORT WSLENV=DATA_DIR:PORT timeout -s KILL 20 node.exe index.js > "$S/boot.log" 2>&1 &) 2>/dev/null
  ok=0; for i in $(seq 1 30); do grep -q 'Job Card Server started' "$S/boot.log" 2>/dev/null && ok=1 && break; sleep 0.5; done
else
rm -rf "$S/data-check"; mkdir -p "$S/data-check"
(cd "$R/server" && DATA_DIR="$S/data-check" PORT=$PORT timeout -s KILL 20 node index.js > "$S/boot.log" 2>&1 &) 2>/dev/null
ok=0; for i in $(seq 1 30); do c=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/auth/me"); [ "$c" != 000 ] && ok=1 && break; sleep 0.5; done
fi
[ $ok = 1 ] && echo "SERVER BOOT OK" || { echo "SERVER BOOT FAILED"; tail -20 "$S/boot.log"; fail=1; }
exit $fail
