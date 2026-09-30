import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MCP_TOOLS, TOOL_GROUPS, is_mcp_tool_name, tool_annotations, type McpToolName } from './tool_catalog'

// The route throws at registration when a tool is missing from the catalog, but that
// only fires on the first live request. Scanning the source catches it in CI instead,
// and also catches the reverse: a catalog entry left behind for a removed tool, which
// the /docs page would keep advertising.
function registered_tool_names(): string[] {
  const files = ['app/api/mcp/route.ts', 'app/api/mcp/_extra_tools.ts']
  const names: string[] = []
  for (const file of files) {
    const src = readFileSync(path.resolve(__dirname, '../..', file), 'utf8')
    for (const m of src.matchAll(/server\.registerTool\(\s*'([a-z_]+)'/g)) names.push(m[1])
  }
  return names
}

const names = Object.keys(MCP_TOOLS) as McpToolName[]

describe('MCP tool catalog', () => {
  it('has exactly one entry per registered tool', () => {
    const registered = registered_tool_names()
    expect(registered.length).toBeGreaterThan(40)
    expect(new Set(registered).size).toBe(registered.length)
    expect([...registered].sort()).toEqual([...names].sort())
  })

  it('sets title and all three hints explicitly on every tool', () => {
    for (const name of names) {
      const a = tool_annotations(name)
      expect(a.title.length).toBeGreaterThan(0)
      expect(typeof a.readOnlyHint).toBe('boolean')
      expect(typeof a.destructiveHint).toBe('boolean')
      expect(a.openWorldHint).toBe(false)
      expect(a.readOnlyHint && a.destructiveHint).toBe(false)
    }
  })

  it('marks every delete, update and approval transition destructive', () => {
    for (const name of names) {
      if (/^(delete|update|remove|set)_|_request$|^accept_all_from$/.test(name)) {
        expect(MCP_TOOLS[name].kind, name).toBe('destructive')
      }
    }
  })

  it('marks every get/list/find tool read-only', () => {
    for (const name of names) {
      if (/^(get|list|find)_/.test(name)) expect(MCP_TOOLS[name].kind, name).toBe('read')
    }
  })

  it('uses unique titles and only known groups', () => {
    const titles = names.map(n => MCP_TOOLS[n].title)
    expect(new Set(titles).size).toBe(titles.length)
    for (const name of names) expect(TOOL_GROUPS).toContain(MCP_TOOLS[name].group)
  })

  it('narrows names', () => {
    expect(is_mcp_tool_name('get_net_worth')).toBe(true)
    expect(is_mcp_tool_name('pay')).toBe(false)
    expect(is_mcp_tool_name('toString')).toBe(false)
  })
})
