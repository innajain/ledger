---
name: mcp-as-user
description: Call the ledger's MCP tools authenticated as any user (e.g. a test counterparty like `pankz`) by minting a short-lived access token directly in the DB and curling /api/mcp. Use when an action must be taken as another account — approving/rejecting a request that awaits the counterparty, reading their inbox, reproducing a bug from their side — and the connected MCP connector is signed in as someone else.
---

# MCP as another user

The connected ledger MCP connector is signed in as **shreyansh**. Approval tools
only act on requests where `pending_by` is the caller, so anything awaiting the
counterparty (`list_requests` → `outbox`) can't be done from that connector.
This skill mints a bearer token for the other user and calls the same endpoint,
so the action runs through the real server code path (`approve_request_core`,
`build_actor_copy`, lock checks, `invalidate_balances` on both sides) — never
hand-write the equivalent rows in SQL.

**Only for accounts the user owns** (their own test/secondary users). Confirm
that before acting as someone else; a real counterparty must act themselves.

## Usage

```bash
.claude/skills/mcp-as-user/mcp_as.sh [--local] <username> <tool> '<json args>' [<tool> '<json args>' ...]
```

- Default is **prod**: `PROD_DATABASE_URL` + `https://ledger.shreyansh.online`. `--local` uses `DATABASE_URL` + `http://localhost:3000`; `MCP_BASE_URL` overrides the host.
- Several tool calls can be chained in one run (one token for all of them).
- The token lives 10 minutes and the script deletes its row on exit, success or not.

Examples:

```bash
# See what awaits pankz
.claude/skills/mcp-as-user/mcp_as.sh pankz list_requests '{}'

# Approve requests as pankz, auto-balancing onto his own `pankz` account
.claude/skills/mcp-as-user/mcp_as.sh pankz \
  approve_request '{"link_id":"<id1>","account":"pankz"}' \
  approve_request '{"link_id":"<id2>","account":"pankz"}'
```

## Workflow

1. From the main connector, `list_requests` → take the `outbox` rows whose `other_username` is the target. Those are `pending_by` them.
2. Run `list_requests` as the target to confirm they see them in their `inbox`, and `list_heads` to pick their balancing account (an own, non-linked `account` head).
3. Approve one `link_id` at a time. Avoid `accept_all_from` when any of the counterparty's links has no transaction on the other side (`my_txn_id: null` in the outbox): `build_actor_copy` throws "No counterpart transaction to mirror" and the whole batch rolls back.
4. Verify by re-running `list_requests` from the main connector (approved rows drop out of the outbox).

## How it works / gotchas

- Tokens are stored as `sha256(raw).hex` in `mcp_access_token.token_hash` (`hash_token` in `lib/mcp/tokens.ts`); `resolve_access_token` only checks hash, `revoked`, `expires_at`. `client_id` is a FK, so the script borrows the newest `mcp_oauth_client`.
- `.env` can't be `source`d (URLs contain `&`) — read single keys with grep.
- Homebrew `psql` can't verify Neon's cert without `PGSSLROOTCERT=/etc/ssl/cert.pem` (`system` isn't supported by that libpq).
- The endpoint needs `Accept: application/json, text/event-stream` and answers in SSE (`data: {...}`); no `initialize` handshake is required for `tools/call`.
- The pooled Neon host is fine here — only `prisma migrate` needs the unpooled one.
- Don't try to run `app/_core/*` directly with `tsx`: those modules import `server-only`, which doesn't resolve outside Next.
