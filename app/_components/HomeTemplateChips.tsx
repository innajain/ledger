/**
 * Two templates with the same name are indistinguishable as chips, so only the first
 * of each name is shown. Unnamed templates are kept as-is.
 */
export function dedupe_template_chips<T extends { description: string | null }>(templates: T[]): T[] {
  const seen = new Set<string>()
  return templates.filter(t => {
    const name = t.description?.trim().toLowerCase()
    if (!name) return true
    if (seen.has(name)) return false
    seen.add(name)
    return true
  })
}
