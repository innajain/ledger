import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { env } from '@/lib/env'
import { profile } from '@/lib/metrics/profile'
import { MCP_TOOLS, TOOL_GROUPS, type McpToolName, type ToolKind } from '@/lib/mcp/tool_catalog'
import { Code, DocLink, DocList, DocSection, DocShell, SupportContact } from '@/app/_components/DocProse'

export const metadata: Metadata = {
  title: 'Connector docs',
  description: 'Connect Ledger to Claude or ChatGPT: setup, example prompts, safety features, and the full tool list',
}

const KIND_BADGE: Record<ToolKind, { label: string; className: string }> = {
  read: { label: 'Read-only', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  write: { label: 'Write', className: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  destructive: { label: 'Changes or deletes', className: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
}

const tools_by_group = TOOL_GROUPS.map(group => ({
  group,
  tools: (Object.keys(MCP_TOOLS) as McpToolName[]).filter(name => MCP_TOOLS[name].group === group),
}))

async function public_origin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https')
  return `${proto}://${host}`
}

// Public (whitelisted in proxy.ts): the documentation URL both connector directories
// ask for. The tool list renders from lib/mcp/tool_catalog.ts, the same table that
// stamps each tool's title and annotations, so it can't drift from the server.
async function Page() {
  const server_url = `${await public_origin()}/api/mcp`
  return (
    <DocShell
      title="Ledger connector for Claude and ChatGPT"
      subtitle="Read and update your ledger from an AI assistant — the same data, rules and approvals as the web app."
    >
      <DocSection title="What it does">
        <p>
          The Ledger connector is a remote MCP server. Once it is connected, your assistant can answer questions about your net worth, balances,
          spending, investments and income tax, and record or edit entries for you. Every change goes through the same validation, reconciliation
          locks and linked-account approvals as the web app.
        </p>
        <p>
          It is a record-keeping tool: no tool moves money, contacts a bank, or starts a payment. &ldquo;Record payment&rdquo; writes down a payment
          you already made.
        </p>
      </DocSection>

      <DocSection title="Before you start">
        <p>
          You need a Ledger account — <DocLink href="/login">sign up or sign in</DocLink>. The server URL is <Code>{server_url}</Code>.
        </p>
      </DocSection>

      <DocSection title="Connect to Claude">
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            Find Ledger in Claude&rsquo;s connector directory, or add it yourself: <strong>Settings → Connectors → Add custom connector</strong>, then
            paste the server URL.
          </li>
          <li>Claude opens Ledger&rsquo;s sign-in page. Sign in, review the access request, and choose Allow.</li>
          <li>In a chat, turn on the Ledger connector from the tools menu and ask away.</li>
        </ol>
      </DocSection>

      <DocSection title="Connect to ChatGPT">
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            Find Ledger in ChatGPT&rsquo;s app directory. With developer mode on, you can instead add it as a custom app using the server URL above.
          </li>
          <li>Sign in to Ledger when prompted and allow access.</li>
        </ol>
      </DocSection>

      <DocSection title="Try asking">
        <DocList>
          <li>&ldquo;What&rsquo;s my net worth, and how are my investments doing?&rdquo;</li>
          <li>&ldquo;How much did I spend last month compared with the month before?&rdquo;</li>
          <li>&ldquo;I paid ₹450 for lunch from HDFC yesterday — record it the way I usually do.&rdquo;</li>
          <li>&ldquo;What was my HDFC balance at the end of March?&rdquo;</li>
          <li>&ldquo;Do I have any pending approval requests?&rdquo;</li>
          <li>&ldquo;Estimate my income tax for this financial year.&rdquo;</li>
        </DocList>
      </DocSection>

      <DocSection title="How it keeps your ledger safe">
        <DocList>
          <li>
            Every tool declares what it does: read-only tools change nothing, and tools that overwrite or delete are marked so, which lets your
            assistant ask before running them.
          </li>
          <li>Every write returns the resulting balances of the accounts it touched, so mistakes show up immediately.</li>
          <li>
            Creating a transaction accepts an idempotency key (a retry never double-posts) and a dry run (validate without writing), and a likely
            duplicate — same account, same amount, within 36 hours — is refused unless confirmed.
          </li>
          <li>Deleting a transaction returns a full copy of it, so it can be re-created.</li>
          <li>Accounts you have reconciled can be locked; entries on or before the lock date cannot be changed.</li>
          <li>
            A transaction shared with another Ledger user needs that user&rsquo;s approval, and your assistant is told to explain the effect before
            approving or rejecting anything.
          </li>
        </DocList>
      </DocSection>

      <DocSection title="Sign-in and access">
        <p>
          The connector uses OAuth 2.1 with PKCE. Your assistant acts as you, with exactly your permissions, and sees only your ledger. Access tokens
          last one hour; refresh tokens last 90 days and rotate on each use. To revoke access, disconnect Ledger in your assistant&rsquo;s connector
          settings. Editing the shared asset catalog is limited to admin accounts, as on the web.
        </p>
      </DocSection>

      <DocSection title="Attachments">
        <p>
          Small text, JSON or image files (up to 64 KB) can be attached directly. Larger files, such as PDF statements and photos, use a one-time
          upload link that expires after 10 minutes. The file type is checked from its contents, not its name.
        </p>
      </DocSection>

      <DocSection title="Good to know">
        <DocList>
          <li>Dates are in Indian Standard Time and accept dd-MM-yyyy or yyyy-MM-dd.</li>
          <li>Bulk creation takes up to 50 transactions per call and is all-or-nothing.</li>
          <li>Scheduled (future) transactions never affect balances until they are converted.</li>
        </DocList>
      </DocSection>

      <DocSection id="tools" title="Tools">
        <div className="space-y-6">
          {tools_by_group.map(({ group, tools }) => (
            <div key={group}>
              <h3 className="font-medium text-slate-900 dark:text-slate-100 mb-2">{group}</h3>
              <ul className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
                {tools.map(name => {
                  const badge = KIND_BADGE[MCP_TOOLS[name].kind]
                  return (
                    <li key={name} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="text-slate-900 dark:text-slate-100">{MCP_TOOLS[name].title}</span>{' '}
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400 break-all">{name}</span>
                      </span>
                      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </DocSection>

      <DocSection title="Support and privacy">
        <p>
          Questions or problems: <SupportContact email={env.SUPPORT_EMAIL} />. How your data is handled is set out in the{' '}
          <DocLink href="/privacy">privacy policy</DocLink>.
        </p>
      </DocSection>
    </DocShell>
  )
}

export default profile('/docs', Page)
