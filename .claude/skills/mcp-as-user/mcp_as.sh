#!/usr/bin/env bash
# Call the ledger MCP endpoint as any user, by minting a short-lived access token
# straight into mcp_access_token and deleting it again on exit (even on failure).
#
#   mcp_as.sh [--local] <username> <tool> '<json args>' [<tool> '<json args>' ...]
#
# Default target is prod (PROD_DATABASE_URL + https://ledger.shreyansh.online).
# --local uses DATABASE_URL + http://localhost:3000. Override the host with MCP_BASE_URL.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TARGET=prod
if [[ "${1:-}" == "--local" ]]; then TARGET=local; shift; fi
if [[ $# -lt 3 || $(( ($# - 1) % 2 )) -ne 0 ]]; then
  echo "usage: $0 [--local] <username> <tool> '<json args>' [<tool> '<json args>' ...]" >&2
  exit 2
fi
USERNAME=$1; shift

# .env values may be quoted and contain '&', so it can't be sourced — read single keys.
env_get() { grep -E "^$1=" .env | cut -d= -f2- | sed -E "s/^['\"]//; s/['\"]$//"; }
if [[ $TARGET == prod ]]; then
  DB=$(env_get PROD_DATABASE_URL)
  BASE=${MCP_BASE_URL:-https://ledger.shreyansh.online}
else
  DB=$(env_get DATABASE_URL)
  BASE=${MCP_BASE_URL:-http://localhost:3000}
fi
[[ -n $DB ]] || { echo "database URL for $TARGET not set in .env" >&2; exit 1; }

# Homebrew libpq has no system CA store; Neon's sslmode=verify-full needs one.
export PGSSLROOTCERT=${PGSSLROOTCERT:-/etc/ssl/cert.pem}
q() { psql "$DB" -v ON_ERROR_STOP=1 -Atc "$1"; }

USER_ID=$(q "select id from \"user\" where username = '${USERNAME//\'/\'\'}'")
[[ -n $USER_ID ]] || { echo "no user '$USERNAME' in $TARGET" >&2; exit 1; }
# mcp_access_token.client_id is a FK, so borrow any registered client.
CLIENT_ID=$(q "select client_id from mcp_oauth_client order by created_at desc limit 1")
[[ -n $CLIENT_ID ]] || { echo "no mcp_oauth_client rows in $TARGET — connect any MCP client once first" >&2; exit 1; }

TOKEN=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
HASH=$(printf %s "$TOKEN" | shasum -a 256 | cut -d' ' -f1) # = hash_token() in lib/mcp/tokens.ts
ROW_ID="cli_$(openssl rand -hex 8)"
q "insert into mcp_access_token (id, token_hash, client_id, user_id, scope, expires_at)
   values ('$ROW_ID', '$HASH', '$CLIENT_ID', '$USER_ID', 'ledger', now() + interval '10 minutes')" >/dev/null
trap 'q "delete from mcp_access_token where id = '"'"'$ROW_ID'"'"'" >/dev/null && echo "(temp token deleted)" >&2' EXIT
echo "as $USERNAME ($USER_ID) on $BASE" >&2

ID=0
while [[ $# -gt 0 ]]; do
  TOOL=$1 ARGS=$2; shift 2; ID=$((ID + 1))
  echo "== $TOOL $ARGS"
  BODY=$(node -e 'console.log(JSON.stringify({jsonrpc:"2.0",id:+process.argv[1],method:"tools/call",params:{name:process.argv[2],arguments:JSON.parse(process.argv[3])}}))' "$ID" "$TOOL" "$ARGS")
  curl -sS "$BASE/api/mcp" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
    -d "$BODY" |
    # Response is SSE ("data: {...}") or plain JSON; print the tool's text content.
    node -e '
      let s = ""; process.stdin.on("data", d => (s += d)).on("end", () => {
        const lines = s.split("\n").filter(l => l.startsWith("data: ")).map(l => l.slice(6))
        for (const raw of lines.length ? lines : [s]) {
          let m; try { m = JSON.parse(raw) } catch { console.log(raw); continue }
          if (m.error) { console.log("RPC ERROR", JSON.stringify(m.error)); process.exitCode = 1; continue }
          if (m.result?.isError) { console.log("TOOL ERROR"); process.exitCode = 1 }
          for (const c of m.result?.content ?? []) console.log(c.type === "text" ? c.text : `[${c.type}]`)
        }
      })'
done
