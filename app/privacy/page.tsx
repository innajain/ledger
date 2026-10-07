import type { Metadata } from 'next'
import { env } from '@/lib/env'
import { profile } from '@/lib/metrics/profile'
import { Code, DocLink, DocList, DocSection, DocShell, SupportContact } from '@/app/_components/DocProse'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What Ledger collects, why, who receives it, and how long it is kept',
}

// Public (whitelisted in proxy.ts): both connector directories link here from the
// listing, so it must render for a signed-out visitor. Every claim below is about
// wiring that exists in this repo — keep them in step when the wiring changes.
async function Page() {
  const support = env.SUPPORT_EMAIL
  return (
    <DocShell title="Privacy Policy" subtitle="Effective 30 September 2026">
      <p>
        Ledger is a personal-finance record-keeping app operated by Shreyansh Jain (&ldquo;we&rdquo;, &ldquo;us&rdquo;). This policy covers the Ledger
        web app and its connector for AI assistants such as Claude and ChatGPT. Ledger records what you tell it: it never moves money, connects to
        your bank, or initiates a payment.
      </p>

      <DocSection title="What we collect">
        <DocList>
          <li>
            <strong>Account details</strong> — your username, a bcrypt hash of your password (never the password itself), your optional UPI ID, and
            your preferences such as theme, amount masking and default accounts.
          </li>
          <li>
            <strong>Ledger content you enter</strong> — accounts and categories, transactions with their amounts, descriptions and dates, tags,
            templates, tax classifications, and any files you attach to a transaction.
          </li>
          <li>
            <strong>Linked-account data</strong> — when an account in your ledger is linked to another user, the shared lines of a transaction
            (amount, description and date) are copied into both ledgers, together with the approval requests between you.
          </li>
          <li>
            <strong>AI connector data</strong> — when you connect an AI assistant, we store its client registration and hashed access and refresh
            tokens tied to your account. We receive only the tool calls the assistant makes for you: the arguments it sends and the results we return.
            We never receive or read your conversation, the assistant&rsquo;s memory, or your chat history.
          </li>
          <li>
            <strong>Push notifications</strong> — if you turn them on, your browser&rsquo;s push subscription (an endpoint address and encryption
            keys), plus a record of each notification sent to it — when it was sent, and whether your device showed and opened it — which the person
            whose request it was can see, kept for 30 days.
          </li>
          <li>
            <strong>Technical data</strong> — your IP address, used only for rate limiting and held in our cache for at most an hour; per-request
            performance measurements (the page, timings and database query counts) linked to your account ID; page-speed measurements with no account
            attached; and error reports.
          </li>
        </DocList>
        <p>
          There are no advertising or analytics trackers. The only cookie is <Code>ledger_token</Code>, an HTTP-only session cookie that keeps you
          signed in.
        </p>
      </DocSection>

      <DocSection title="How we use it">
        <p>
          Only to run Ledger for you: storing your entries and computing balances, net worth, returns and tax figures; showing shared transactions to
          the user they are linked with; sending the notifications you turn on; protecting accounts through rate limiting and session revocation; and
          diagnosing errors and slow pages. We do not sell your data, use it for advertising, or use it to train AI models.
        </p>
      </DocSection>

      <DocSection title="Who receives it">
        <DocList>
          <li>
            <strong>Service providers that run Ledger</strong> — Vercel (application hosting and private file storage), Neon (PostgreSQL database), a
            managed Redis service (short-lived cache), Sentry (error monitoring, configured to collect no request bodies, headers, cookies, IP
            addresses, query parameters or variable values), and GitHub (private storage for nightly database backups). They process data on our
            behalf, possibly outside your country.
          </li>
          <li>
            <strong>Other Ledger users</strong> — only as described under linked accounts. Another user who knows your exact username can look up your
            account in order to link it.
          </li>
          <li>
            <strong>AI assistants you connect</strong> — results of the tools the assistant calls go to that assistant&rsquo;s provider (for example
            Anthropic or OpenAI) and are governed by its privacy policy. You choose whether to connect one, and can disconnect it at any time.
          </li>
          <li>
            <strong>Push services</strong> — your browser vendor&rsquo;s push service delivers notifications; their contents are encrypted end to end
            to your browser.
          </li>
          <li>
            <strong>Market-data sources</strong> — Yahoo Finance and AMFI are queried by ticker or scheme to price assets. No personal data is sent.
          </li>
          <li>
            <strong>Authorities</strong> — when the law requires it.
          </li>
        </DocList>
      </DocSection>

      <DocSection title="How long we keep it">
        <DocList>
          <li>Your account, ledger entries and performance records: until you delete them or ask us to delete your account.</li>
          <li>Database backups: 30 days, so deleted data is gone from backups within 30 days.</li>
          <li>Attachments: removed from storage when deleted; a weekly job clears anything left behind.</li>
          <li>
            AI connector tokens: access tokens expire after 1 hour and refresh tokens after 90 days, rotating on each use. Attachment upload links
            expire after 10 minutes and work once.
          </li>
          <li>Rate-limit counters: at most one hour. Error reports: up to 90 days, per Sentry&rsquo;s retention.</li>
        </DocList>
      </DocSection>

      <DocSection title="Your choices">
        <DocList>
          <li>
            <strong>Export</strong> your data at any time from Settings → Data (CSV, Excel or SQL).
          </li>
          <li>
            <strong>Correct or delete</strong> any entry in the app or through the connector. To delete your whole account, contact us and we will do
            so within 30 days.
          </li>
          <li>
            <strong>Disconnect an AI assistant</strong> from that assistant&rsquo;s own connector settings; it then stops receiving new tokens.
          </li>
          <li>
            <strong>Turn off push notifications</strong> in Settings → Preferences or in your browser.
          </li>
        </DocList>
        <p>
          Depending on where you live you may have further rights — for example to access, correct or erase your data under India&rsquo;s Digital
          Personal Data Protection Act, 2023. Contact us to exercise them.
        </p>
      </DocSection>

      <DocSection title="Security">
        <p>
          All traffic uses HTTPS. Passwords are stored as bcrypt hashes; OAuth codes, access and refresh tokens, and attachment upload links are
          stored only as SHA-256 hashes. Attachments sit in a private store and are served only to their owner, and every database query is scoped to
          the signed-in user.
        </p>
      </DocSection>

      <DocSection title="Children">
        <p>Ledger is not intended for anyone under 18.</p>
      </DocSection>

      <DocSection title="Changes">
        <p>When this policy changes we update the effective date above, and for material changes we tell you in the app.</p>
      </DocSection>

      <DocSection title="Contact">
        <p>
          Questions or requests: <SupportContact email={support} />. See also the <DocLink href="/docs">connector documentation</DocLink>.
        </p>
      </DocSection>
    </DocShell>
  )
}

export default profile('/privacy', Page)
