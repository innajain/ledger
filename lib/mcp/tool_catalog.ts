// Every MCP tool's human-facing metadata, in one place. The registerTool wrapper in
// app/api/mcp/route.ts stamps `title` and `annotations` from here onto each tool and
// refuses to register a name that is missing, and the public /docs page renders its
// tool list from the same table — so the directories' reviewers, the connected model,
// and the docs can never disagree about what a tool does.
//
// Both connector directories require the annotations: Claude wants a title plus
// readOnlyHint/destructiveHint on every tool, ChatGPT wants readOnlyHint,
// destructiveHint and openWorldHint set explicitly. `kind` is one field rather than
// two booleans so a tool can't be declared read-only and destructive at once.
//
// kind:
//   read        — reads only; changes nothing.
//   write       — purely additive: creates something new and overwrites nothing.
//   destructive — overwrites, removes, cancels or bulk-applies existing state
//                 (every update/delete, and the approval transitions, which rebuild
//                 or delete your copy of a shared transaction).
//
// openWorldHint is false throughout: every tool acts on the caller's own ledger,
// never on an open-ended external domain like the web.
//
// Import-free on purpose — the /docs page and the unit test both load it.

export type ToolKind = 'read' | 'write' | 'destructive'

export const TOOL_GROUPS = [
  'Overview & balances',
  'Transactions',
  'Heads & assets',
  'Tags',
  'Templates',
  'Attachments',
  'Linked accounts & approvals',
  'Tax & settings',
] as const

export type ToolGroup = (typeof TOOL_GROUPS)[number]

type ToolEntry = { title: string; kind: ToolKind; group: ToolGroup }

export const MCP_TOOLS = {
  get_net_worth: { title: 'Get net worth', kind: 'read', group: 'Overview & balances' },
  get_holdings: { title: 'Get holdings', kind: 'read', group: 'Overview & balances' },
  get_balances: { title: 'Get account balances', kind: 'read', group: 'Overview & balances' },
  get_income_expense: { title: 'Get income and expenses', kind: 'read', group: 'Overview & balances' },
  validate_my_transactions: { title: 'Validate transactions', kind: 'read', group: 'Overview & balances' },

  list_transactions: { title: 'List transactions', kind: 'read', group: 'Transactions' },
  find_similar_transactions: { title: 'Find similar transactions', kind: 'read', group: 'Transactions' },
  get_transaction: { title: 'Get transaction', kind: 'read', group: 'Transactions' },
  create_transaction: { title: 'Create transaction', kind: 'write', group: 'Transactions' },
  create_transactions: { title: 'Create transactions in bulk', kind: 'write', group: 'Transactions' },
  record_payment: { title: 'Record payment', kind: 'write', group: 'Transactions' },
  convert_future_transaction: { title: 'Convert scheduled transaction', kind: 'write', group: 'Transactions' },
  update_transaction: { title: 'Update transaction', kind: 'destructive', group: 'Transactions' },
  delete_transaction: { title: 'Delete transaction', kind: 'destructive', group: 'Transactions' },

  list_heads: { title: 'List heads', kind: 'read', group: 'Heads & assets' },
  get_head: { title: 'Get head details', kind: 'read', group: 'Heads & assets' },
  list_assets: { title: 'List assets', kind: 'read', group: 'Heads & assets' },
  get_asset: { title: 'Get asset details', kind: 'read', group: 'Heads & assets' },
  create_head: { title: 'Create head', kind: 'write', group: 'Heads & assets' },
  create_asset: { title: 'Create asset', kind: 'write', group: 'Heads & assets' },
  update_head: { title: 'Update head', kind: 'destructive', group: 'Heads & assets' },
  delete_head: { title: 'Delete head', kind: 'destructive', group: 'Heads & assets' },
  update_asset: { title: 'Update asset', kind: 'destructive', group: 'Heads & assets' },
  delete_asset: { title: 'Delete asset', kind: 'destructive', group: 'Heads & assets' },
  reorder_siblings: { title: 'Reorder heads or assets', kind: 'destructive', group: 'Heads & assets' },

  list_tags: { title: 'List tags', kind: 'read', group: 'Tags' },
  get_tag: { title: 'Get tag', kind: 'read', group: 'Tags' },
  create_tag: { title: 'Create tag', kind: 'write', group: 'Tags' },
  add_transactions_to_tag: { title: 'Add transactions to tag', kind: 'write', group: 'Tags' },
  update_tag: { title: 'Update tag', kind: 'destructive', group: 'Tags' },
  delete_tag: { title: 'Delete tag', kind: 'destructive', group: 'Tags' },
  remove_transactions_from_tag: { title: 'Remove transactions from tag', kind: 'destructive', group: 'Tags' },
  set_transaction_tags: { title: 'Set transaction tags', kind: 'destructive', group: 'Tags' },

  list_templates: { title: 'List templates', kind: 'read', group: 'Templates' },
  create_template: { title: 'Create template', kind: 'write', group: 'Templates' },
  update_template: { title: 'Update template', kind: 'destructive', group: 'Templates' },
  delete_template: { title: 'Delete template', kind: 'destructive', group: 'Templates' },

  get_attachment: { title: 'Get attachment', kind: 'read', group: 'Attachments' },
  add_attachment: { title: 'Add attachment', kind: 'write', group: 'Attachments' },
  request_attachment_upload: { title: 'Request attachment upload link', kind: 'write', group: 'Attachments' },
  delete_attachment: { title: 'Delete attachment', kind: 'destructive', group: 'Attachments' },

  list_requests: { title: 'List approval requests', kind: 'read', group: 'Linked accounts & approvals' },
  find_user: { title: 'Find user', kind: 'read', group: 'Linked accounts & approvals' },
  approve_request: { title: 'Approve request', kind: 'destructive', group: 'Linked accounts & approvals' },
  reject_request: { title: 'Reject request', kind: 'destructive', group: 'Linked accounts & approvals' },
  cancel_request: { title: 'Cancel request', kind: 'destructive', group: 'Linked accounts & approvals' },
  revert_request: { title: 'Revert request', kind: 'destructive', group: 'Linked accounts & approvals' },
  accept_all_from: { title: 'Accept all requests from a user', kind: 'destructive', group: 'Linked accounts & approvals' },

  get_tax_computation: { title: 'Get tax computation', kind: 'read', group: 'Tax & settings' },
  get_settings: { title: 'Get settings', kind: 'read', group: 'Tax & settings' },
  update_settings: { title: 'Update settings', kind: 'destructive', group: 'Tax & settings' },
} as const satisfies Record<string, ToolEntry>

export type McpToolName = keyof typeof MCP_TOOLS

export function is_mcp_tool_name(name: string): name is McpToolName {
  return Object.hasOwn(MCP_TOOLS, name)
}

export function tool_annotations(name: McpToolName) {
  const { title, kind } = MCP_TOOLS[name]
  return {
    title,
    readOnlyHint: kind === 'read',
    destructiveHint: kind === 'destructive',
    openWorldHint: false,
  }
}
