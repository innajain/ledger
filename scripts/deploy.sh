#!/usr/bin/env bash
# Build a commit on this Mac and ship it to the VM as a release.
#
#   scripts/deploy.sh [git-ref]   build <git-ref> (default HEAD) and make it live
#   scripts/deploy.sh --rollback  point the VM back at the release before the live one
#   scripts/deploy.sh --list      show the releases on the VM
#
# The build runs in a linux/arm64 container (the VM is arm64 too). Node runs pnpm, and
# Bun builds and serves current revisions. The release contains Next's standalone output,
# .next/static, public/, and the same Linux Bun binary used to build it.
#
# VM layout (one-time cutover recorded in the VM journal, 25 Nov 2026):
#   ~/ledger/.env                 secrets, unchanged; each release links to it
#   ~/ledger/releases/<sha>/      one per deploy; the newest three are kept
#   ~/ledger/current, previous    symlinks; systemd selects the runtime in current
#
# Steps: refuse a commit that isn't on origin/main (ALLOW_UNPUSHED=1 overrides); refuse a
# release that adds migrations unless MIGRATE=1, then apply them through an SSH tunnel
# before anything switches; build; upload; start the release on :3100 and render every
# main page as the owner (~/bin/ledger-warmup.py --check); only then flip `current`,
# restart, and check health — an unhealthy restart flips straight back. Each deploy and
# rollback appends its line to ~/JOURNAL.md on the VM.
#
# Env: DEPLOY_HOST (ssh host, default vm), ALLOW_UNPUSHED=1, MIGRATE=1.
set -euo pipefail

HOST=${DEPLOY_HOST:-vm}
REPO=$(git rev-parse --show-toplevel)
cd "$REPO"

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
die() {
  printf '\033[31merror:\033[0m %s\n' "$*" >&2
  exit 1
}
# One SSH connection per run, shared by every step. The path to the VM sometimes stalls a
# handshake for minutes before resetting it (sshd logs no throttling; HTTPS to the same
# address is unaffected), so a run makes as few handshakes as it can: connect() opens a
# master, gives each attempt 30 s, tries three times, and everything else rides on it.
SOCK="/tmp/ledger-deploy-$$.sock"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o ControlPath="$SOCK")
MASTER_PID=
connect() {
  ssh "${SSH_OPTS[@]}" -O check "$HOST" 2>/dev/null && return 0
  local attempt i
  for attempt in 1 2 3; do
    [ -n "$MASTER_PID" ] && kill "$MASTER_PID" 2>/dev/null
    rm -f "$SOCK"
    ssh "${SSH_OPTS[@]}" -o ControlMaster=yes -N "$HOST" &
    MASTER_PID=$!
    for i in $(seq 1 30); do
      ssh "${SSH_OPTS[@]}" -O check "$HOST" 2>/dev/null && return 0
      kill -0 "$MASTER_PID" 2>/dev/null || break
      sleep 1
    done
    say "SSH to $HOST did not come up (attempt $attempt of 3)"
  done
  die "could not connect to $HOST"
}
disconnect() {
  ssh "${SSH_OPTS[@]}" -O exit "$HOST" 2>/dev/null || true
  [ -n "$MASTER_PID" ] && kill "$MASTER_PID" 2>/dev/null || true
  rm -f "$SOCK"
}
trap disconnect EXIT
remote() { ssh "${SSH_OPTS[@]}" -o ControlMaster=no "$HOST" "$@"; }

# Appends one line to the VM journal under today's heading (UTC), adding the heading if
# today has none yet. The text travels base64-encoded so no quoting can mangle it.
journal() {
  local b64
  b64=$(printf '%s' "$1" | base64 | tr -d '\n')
  remote "today=\$(date -u +%F); [ \"\$(grep '^## ' ~/JOURNAL.md | tail -1)\" = \"## \$today\" ] || printf '\n## %s\n\n' \"\$today\" >> ~/JOURNAL.md; echo '$b64' | base64 -d >> ~/JOURNAL.md; echo >> ~/JOURNAL.md"
}

# Restarts the service, then asks for /api/health over fresh connections. systemctl
# returns once the warm-up (ExecStartPost) has run; the restart itself is a systemd job,
# so it completes even if this connection drops — which is why health is judged on new
# connections rather than on the restart session's exit status.
restart_and_check() {
  remote 'sudo systemctl restart ledger' || say "Lost the connection during the restart; checking health over a new one"
  local i code
  for i in $(seq 1 10); do
    connect
    code=$(remote 'curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3000/api/health' 2>/dev/null || true)
    [ "$code" = 200 ] && return 0
    sleep 3
  done
  return 1
}

connect

case "${1:-}" in
  --list)
    remote 'cd ~/ledger && cur=$(readlink current || true); prev=$(readlink previous || true); for d in $(ls -t releases); do m=""; [ "releases/$d" = "$cur" ] && m=" (live)"; [ "releases/$d" = "$prev" ] && m=" (previous)"; echo "$d  $(stat -c %y releases/$d | cut -d. -f1)$m"; done'
    exit 0
    ;;
  --rollback)
    say "Rolling back on $HOST"
    pair=$(remote 'cd ~/ledger && echo "$(readlink current) $(readlink previous)"')
    cur=${pair% *}
    prev=${pair#* }
    [ -n "$prev" ] && [ "$prev" != "$cur" ] || die "no previous release to roll back to"
    remote "cd ~/ledger && ln -sfn '$prev' current.new && mv -Tf current.new current && ln -sfn '$cur' previous.new && mv -Tf previous.new previous"
    restart_and_check || die "restart after rollback is unhealthy — check: ssh $HOST sudo journalctl -u ledger -n 50"
    journal "- $(date -u +%H:%M) (Mac) Ledger rollback via scripts/deploy.sh --rollback: ~/ledger/current back to ${prev#releases/} (was ${cur#releases/}); restart healthy. Undo: scripts/deploy.sh --rollback again (the two swap)."
    say "Live: ${prev#releases/}"
    exit 0
    ;;
  -*) die "unknown option $1" ;;
esac

command -v docker >/dev/null || die "docker is not available (OrbStack)"
SHA=$(git rev-parse --verify "${1:-HEAD}^{commit}")
SHORT=${SHA:0:7}

if [ "${ALLOW_UNPUSHED:-}" != 1 ]; then
  git fetch -q origin main
  git merge-base --is-ancestor "$SHA" origin/main || die "$SHORT is not on origin/main — push it first, or set ALLOW_UNPUSHED=1"
fi

say "Reading the live release, Node version and public build settings from $HOST"
remote 'test -L ~/ledger/current' || die "$HOST has no ~/ledger/current — the release layout isn't set up there"
LIVE=$(remote 'cat ~/ledger/current/REVISION 2>/dev/null || true')
NODE_VERSION=$(remote '~/.local/node/bin/node -v' | sed 's/^v//')
# NEXT_PUBLIC_* values are inlined into the browser bundle at build time, so the build has
# to see the server's. They are public by definition; nothing secret leaves the VM.
PUBLIC_ENV=$(remote "grep -E '^NEXT_PUBLIC_[A-Z0-9_]+=' ~/ledger/.env || true" | sed -E "s/^([A-Z0-9_]+)=[\"']?([^\"']*)[\"']?$/\1=\2/")

if [ -n "$LIVE" ]; then
  [ "$LIVE" = "$SHA" ] && die "$SHORT is already live"
  NEW_MIGRATIONS=$(git diff --name-only --diff-filter=A "$LIVE" "$SHA" -- prisma/migrations | grep -c 'migration.sql$' || true)
  CHANGES=$(git log --format='%s' "$LIVE..$SHA" 2>/dev/null | awk 'NR > 1 { printf "; " } { printf "%s", $0 }')
else
  NEW_MIGRATIONS=0
  CHANGES=$(git log -1 --format='%s' "$SHA")
fi
if [ "$NEW_MIGRATIONS" -gt 0 ] && [ "${MIGRATE:-}" != 1 ]; then
  die "$SHORT adds $NEW_MIGRATIONS migration(s) since the live release — rerun with MIGRATE=1 to apply them first"
fi

WORK=$(mktemp -d "${TMPDIR:-/tmp}/ledger-deploy.XXXXXX")
TUNNEL_PID=
cleanup() {
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  rm -rf "$WORK"
  disconnect
}
trap cleanup EXIT

mkdir "$WORK/src"
git archive "$SHA" | tar -x -C "$WORK/src"
RUNTIME='~/.local/node/bin/node'
BUN_VERSION=
if [ -f "$WORK/src/.bun-version" ]; then
  BUN_VERSION=$(cat "$WORK/src/.bun-version")
  remote "systemctl show ledger --property=ExecStart --value | grep -Fq './bun --no-env-file'" ||
    die "configure the ledger systemd service for Bun releases on $HOST (see README)"
  docker run --rm --platform linux/arm64 --entrypoint cat "oven/bun:${BUN_VERSION}-slim" /usr/local/bin/bun >"$WORK/bun"
  chmod +x "$WORK/bun"
  RUNTIME='./bun --no-env-file'
fi

say "Building $SHORT in node:$NODE_VERSION${BUN_VERSION:+ with Bun $BUN_VERSION} (linux/arm64)"
{
  printf '%s\n' "$PUBLIC_ENV"
  echo NEXT_OUTPUT_STANDALONE=1
  echo NEXT_TELEMETRY_DISABLED=1
  # lib/env.ts and prisma.config.ts need these to exist while building; no build step
  # connects or signs anything, and the real values are read from ~/ledger/.env at runtime.
  echo DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
  echo JWT_SECRET=build-time-placeholder
  echo CACHE_DRIVER=memory
  echo BLOB_STORAGE=fs
} >"$WORK/build.env"
build_release() {
  docker run --rm --platform linux/arm64 \
    -v "$WORK/src:/app" -v ledger-deploy-pnpm-store:/pnpm-store -w /app \
    "$@" --env-file "$WORK/build.env" "node:${NODE_VERSION}-bookworm-slim" \
    bash -euo pipefail -c 'corepack enable >/dev/null 2>&1; pnpm config set store-dir /pnpm-store >/dev/null; pnpm install --frozen-lockfile --reporter=append-only >/tmp/install.log 2>&1 || { tail -40 /tmp/install.log; exit 1; }; pnpm build'
}
if [ -n "$BUN_VERSION" ]; then
  build_release -v "$WORK/bun:/usr/local/bin/bun:ro"
else
  build_release
fi

OUT="$WORK/src/.next/standalone"
[ -f "$OUT/server.js" ] || die "the build produced no standalone server"
[ -z "$BUN_VERSION" ] || cp "$WORK/bun" "$OUT/bun"
cp -R "$WORK/src/.next/static" "$OUT/.next/static"
cp -R "$WORK/src/public" "$OUT/public"
echo "$SHA" >"$OUT/REVISION"
# The release's own env tags MCP serverInfo and logs with the commit. Next also
# loads the shared secrets from .env.
echo "VERCEL_GIT_COMMIT_SHA=$SHA" >"$OUT/.env.production"
ln -sfn ../../.env "$OUT/.env"
# macOS tar would otherwise add AppleDouble ._* files and xattrs the server's tar warns on.
COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs -C "$OUT" -czf "$WORK/release.tgz" .
say "Release is $(du -h "$WORK/release.tgz" | cut -f1); uploading"
connect # the build took a while; reopen the connection if it went away meanwhile
remote "rm -rf ~/ledger/releases/$SHORT.tmp && mkdir -p ~/ledger/releases/$SHORT.tmp && tar -xzf - -C ~/ledger/releases/$SHORT.tmp && rm -rf ~/ledger/releases/$SHORT && mv ~/ledger/releases/$SHORT.tmp ~/ledger/releases/$SHORT" <"$WORK/release.tgz"

if [ "$NEW_MIGRATIONS" -gt 0 ]; then
  say "Applying $NEW_MIGRATIONS migration(s) through an SSH tunnel"
  DB_URL=$(remote 'cat ~/secrets/ledger_db_url')
  ssh "${SSH_OPTS[@]}" -o ControlMaster=no -o ExitOnForwardFailure=yes -N -L 15432:127.0.0.1:5432 "$HOST" &
  TUNNEL_PID=$!
  sleep 2
  TUNNELED=$(printf '%s' "$DB_URL" | sed -E 's#@[^/]+/#@host.docker.internal:15432/#')
  docker run --rm --platform linux/arm64 -v "$WORK/src:/app" -w /app -e DATABASE_URL="$TUNNELED" \
    "node:${NODE_VERSION}-bookworm-slim" node node_modules/prisma/build/index.js migrate deploy
  kill "$TUNNEL_PID"
  TUNNEL_PID=
fi

say "Smoke test: the release on :3100, every main page as the owner"
remote "cd ~/ledger/releases/$SHORT && (PORT=3100 HOSTNAME=127.0.0.1 NODE_ENV=production nohup $RUNTIME server.js >~/logs/ledger-smoke.log 2>&1 & echo \$! >/tmp/ledger-smoke.pid) && LEDGER_BASE=http://127.0.0.1:3100 LEDGER_APP_DIR=\$PWD ~/bin/ledger-warmup.py --check; rc=\$?; kill \$(cat /tmp/ledger-smoke.pid) 2>/dev/null; rm -f /tmp/ledger-smoke.pid; exit \$rc" ||
  die "smoke test failed — nothing switched; see ssh $HOST tail -50 ~/logs/ledger-smoke.log"

say "Switching to $SHORT and restarting"
PREV=$(remote 'readlink ~/ledger/current')
remote "cd ~/ledger && ln -sfn releases/$SHORT current.new && mv -Tf current.new current && ln -sfn '$PREV' previous.new && mv -Tf previous.new previous"
if ! restart_and_check; then
  say "Unhealthy after restart — switching back to ${PREV#releases/}"
  remote "cd ~/ledger && ln -sfn '$PREV' current.new && mv -Tf current.new current"
  restart_and_check || die "the previous release is unhealthy too — check: ssh $HOST sudo journalctl -u ledger -n 50"
  die "$SHORT was rolled back; see ssh $HOST sudo journalctl -u ledger -n 80"
fi

# Keep the newest three releases, and never the two the symlinks name.
remote 'cd ~/ledger/releases && keep="$(basename "$(readlink ../current)") $(basename "$(readlink ../previous)")"; ls -t | tail -n +4 | while read -r d; do case " $keep " in *" $d "*) ;; *) rm -rf "$d" ;; esac; done'

MIG_NOTE=""
[ "$NEW_MIGRATIONS" -gt 0 ] && MIG_NOTE=" $NEW_MIGRATIONS migration(s) applied first (not undone by a rollback)."
journal "- $(date -u +%H:%M) (Mac) Ledger deploy $SHORT via scripts/deploy.sh: $CHANGES. Built on the Mac (node:$NODE_VERSION${BUN_VERSION:+ with Bun $BUN_VERSION}, linux/arm64, standalone), release ~/ledger/releases/$SHORT; smoke test on :3100 all 200; restart healthy.$MIG_NOTE Undo: scripts/deploy.sh --rollback (back to ${PREV#releases/})."
say "Live: $SHORT"
