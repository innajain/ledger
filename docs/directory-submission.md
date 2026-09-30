# Connector directory submission (Claude + ChatGPT)

Everything the two submission portals ask for, ready to paste. The code side is in place:
titles and `readOnlyHint` / `destructiveHint` / `openWorldHint` on every tool (from
`lib/mcp/tool_catalog.ts`), a public privacy policy at `/privacy`, public docs at `/docs`,
and the ChatGPT domain-verification route at `/.well-known/openai-apps-challenge`.

## Before you open either portal

1. **Deploy** this branch to production.
2. **Set `SUPPORT_EMAIL`** in the Vercel production env. `/privacy` and `/docs` show it as the
   contact; until it is set they fall back to "the operator of this Ledger instance", which
   reviewers will not accept.
3. **Create the reviewer account on prod.** Point `DATABASE_URL` at the _unpooled_ Neon host
   (README "Migrating prod") and run the seed with a fresh password:

   ```bash
   SEED_PASSWORD='<new strong password>' pnpm dlx tsx scripts/seed_sample_user.ts
   ```

   It wipes and recreates only the `rahul` user: about six months of salary, rent, food,
   commute, SIP and card-bill entries (Dec 2025 – May 2026), HDFC as the default account.

4. **Test it as a custom connector** in Claude (Settings → Connectors → Add custom connector →
   `https://ledger.shreyansh.online/api/mcp`) and in ChatGPT developer mode. Call each tool
   once — the Claude portal asks you to confirm you did.
5. **Record a demo video** (ChatGPT requires one): connect, sign in, run the five positive
   test cases below.

## URLs

| Field               | Value                                            |
| ------------------- | ------------------------------------------------ |
| MCP server          | `https://ledger.shreyansh.online/api/mcp`        |
| Documentation       | `https://ledger.shreyansh.online/docs`           |
| Privacy policy      | `https://ledger.shreyansh.online/privacy`        |
| Icon / logo         | `public/logo-256.png` (256×256 PNG, transparent) |
| Support contact     | the `SUPPORT_EMAIL` you set                      |
| Company / developer | Shreyansh Jain                                   |
| Website             | `https://ledger.shreyansh.online`                |

## Listing copy

**Name:** Ledger

**One-liner** (≤200 chars):
Ask about and update your Ledger personal-finance books — balances, net worth, spending,
investments and income tax — right from the chat.

**Description** (≤2000 chars):

> Ledger is a triple-entry bookkeeping app for personal finance in India. This connector lets
> you work with your own ledger in conversation: ask for your net worth and investment
> returns (XIRR), an account's balance on any past date, spending by category over any
> period, or your new-regime income-tax estimate for the year — and record, edit, tag or
> schedule transactions without opening the app.
>
> The assistant is instructed to look at how you have recorded similar entries before and to
> reuse your existing accounts and categories, so a terse "paid 450 for lunch from HDFC"
> lands in the same structure as the rest of your books.
>
> Every change goes through the same rules as the web app: balancing validation,
> reconciliation locks on accounts you have verified against the bank, and approval by the
> other person for transactions shared with a linked Ledger user. Writes return the updated
> balances of the accounts they touched; creates accept an idempotency key and a dry run, and
> refuse a likely duplicate unless confirmed; deletes return a full copy of what was removed.
>
> Ledger is a record-keeping tool. It never moves money, connects to a bank or starts a
> payment.

**Categories:** Finance; Productivity

## Claude — claude.ai/directory/manage → Submit new → MCP connector

- **Connection:** paste the MCP server URL. Single URL.
- **Tools:** should sync with no flags — every tool has a title and hints.
- **Use cases:**
  - Check net worth, holdings and investment returns.
  - Look up an account's balance today or on a past date, e.g. to reconcile with a bank statement.
  - Summarise income and spending by category for a period.
  - Record, edit, tag and schedule transactions in the user's existing structure.
  - Estimate new-regime income tax for a financial year.
  - Review and act on approval requests for transactions shared with another user.
- **Prerequisites:** a Ledger account (free sign-up at `/login`).
- **Reads / writes:** both.
- **Authentication:** OAuth with dynamic client registration (RFC 7591). Discovery is at
  `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`; the
  `401` from `/api/mcp` carries the `WWW-Authenticate` pointer. Any redirect URI is accepted at
  registration, so Claude's callback needs no allowlisting.
- **Data handling:** first-party API (our own). No health data. No sponsored content.
- **Test & launch:** reviewer credentials — username `rahul`, the `SEED_PASSWORD` you set.
  Steps: add the connector, sign in on the Ledger page that opens, choose Allow on the consent
  screen, then try the positive test cases below. Note that approvals need a second, linked
  user, which the seed does not create.
- **Compliance — financial transactions:** Ledger records transactions; no tool transfers
  money or executes a financial transaction. `record_payment` writes down a payment the user
  already made, and its description says so.

## ChatGPT — platform.openai.com/plugins

1. **Verify** your identity (individual or business) in OpenAI Platform → organization
   settings. Submissions only come from verified developers.
2. **Build the ZIP** from `integrations/chatgpt-plugin/` (`plugin.json`, `mcp.json`,
   `assets/logo.png`):

   ```bash
   cd integrations/chatgpt-plugin && zip -r /tmp/ledger-chatgpt-plugin.zip plugin.json mcp.json assets
   ```

3. **Upload** it and resolve anything the automated checks flag.
4. **Domain verification:** the portal shows a token. Set `OPENAI_APPS_CHALLENGE_TOKEN` to it
   in the Vercel production env and redeploy; `https://ledger.shreyansh.online/.well-known/openai-apps-challenge`
   then returns the bare token. Unset it again after the check passes.
5. **Review details:** reviewer credentials (as above), the test cases below, the demo video
   URL, and release notes ("Initial release: read and update your Ledger books from ChatGPT").
6. **Countries:** OpenAI's app availability is by country; the manifest leaves
   `extensions.com.openai.publication.countries` unset, which keeps the portal's default
   targeting. Ledger's tax and UPI features are India-specific — add `"countries": ["IN"]`
   if you want to limit it.

## Test cases (both portals)

Run against the seeded `rahul` account.

### Positive

| #   | Prompt                                                                            | Expected tools                                                                      | Expected result                                                                                                       |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | What's my net worth, and how are my investments doing?                            | `get_net_worth`                                                                     | Net worth, investments value with XIRR, savings total.                                                                |
| 2   | What was my HDFC balance at the end of March 2026?                                | `get_balances` (`head: HDFC`, `as_of: 31-03-2026`)                                  | HDFC's closing balance on 31 Mar 2026 IST.                                                                            |
| 3   | How much did I earn and spend in March 2026?                                      | `get_income_expense` (`from: 01-03-2026`, `to: 31-03-2026`)                         | Net per income/expense head for March: Salary +95,000, Expenses negative, plus any cashback/interest.                 |
| 4   | I paid ₹240 for lunch from Paytm today — record it the way I usually record food. | `find_similar_transactions` → `create_transaction`                                  | A new entry on Paytm (−240) under the same Food / Expenses heads as past lunches; response shows Paytm's new balance. |
| 5   | Show my last five Google Pay transactions and tag the food ones as "Eating out".  | `list_transactions` (`head: Google Pay`) → `create_tag` → `add_transactions_to_tag` | Five transactions listed; a new "Eating out" tag holding the food ones.                                               |

### Negative

| #   | Prompt                                     | Expected behaviour                                                                                                                                       |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Send ₹5,000 from my HDFC account to Karan. | No money moves. The assistant explains Ledger only records transactions and asks whether the payment was already made before offering to record it.      |
| 2   | Delete every transaction in my ledger.     | No deletion without explicit confirmation — `delete_transaction` is marked destructive, and the assistant should ask first and prefer a narrower action. |
| 3   | What's the weather in Mumbai today?        | No Ledger tool is called; it is outside the connector's scope.                                                                                           |

## After listing

- The Claude listing starts as **Community**; Verified comes later. Status and reviewer
  feedback: claude.ai/directory/manage. Escalations: `mcp-review@anthropic.com`.
- A new MCP tool needs an entry in `lib/mcp/tool_catalog.ts` or the server refuses to start
  it (and `tool_catalog.test.ts` fails in CI); the `/docs` tool list picks it up automatically.
