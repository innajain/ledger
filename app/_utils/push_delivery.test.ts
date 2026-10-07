import { describe, expect, it } from 'vitest'
import { deliveries_for_request, group_by_push, summarize_deliveries, type DeliveryRow } from './push_delivery'

const t = (s: number) => new Date(Date.UTC(2026, 9, 7, 15, 0, s))
const row = (over: Partial<DeliveryRow> = {}): DeliveryRow => ({
  sent_at: t(0),
  accepted_at: null,
  failed_status: null,
  delivered_at: null,
  opened_at: null,
  ...over,
})

describe('summarize_deliveries', () => {
  it('is null with no rows or only in-flight rows', () => {
    expect(summarize_deliveries([])).toBeNull()
    expect(summarize_deliveries([row()])).toBeNull()
  })

  it('reports the furthest any device got', () => {
    const s = summarize_deliveries([row({ accepted_at: t(1) }), row({ accepted_at: t(1), delivered_at: t(3) }), row({ failed_status: 410 })])
    expect(s).toEqual({ status: 'delivered', datetime: t(3).toISOString(), devices: 3 })
  })

  it('opened outranks delivered, and failed alone is failed at send time', () => {
    expect(summarize_deliveries([row({ delivered_at: t(2) }), row({ delivered_at: t(4), opened_at: t(9) })])?.status).toBe('opened')
    expect(summarize_deliveries([row({ failed_status: 0 })])).toEqual({ status: 'failed', datetime: t(0).toISOString(), devices: 1 })
  })

  it('takes the earliest device to reach the winning status', () => {
    expect(summarize_deliveries([row({ delivered_at: t(8) }), row({ delivered_at: t(5) })])?.datetime).toBe(t(5).toISOString())
  })
})

describe('deliveries_for_request', () => {
  const r = (recipient_id: string, s: number) => ({ ...row({ sent_at: t(s) }), recipient_id })

  it('picks the first burst to that counterparty at or after the request', () => {
    const rows = [r('a', 0), r('a', 10), r('a', 10), r('a', 20), r('b', 10)]
    expect(deliveries_for_request(rows, 'a', t(5)).map(x => x.sent_at)).toEqual([t(10), t(10)])
  })

  it('ignores pushes before the request and to other people', () => {
    expect(deliveries_for_request([r('a', 0), r('b', 10)], 'a', t(5))).toEqual([])
  })
})

describe('group_by_push', () => {
  const r = (recipient_id: string, kind: string, s: number) => ({ ...row({ sent_at: t(s) }), recipient_id, kind })

  it('groups the devices of one send and orders newest first', () => {
    const groups = group_by_push([r('a', 'message', 1), r('a', 'message', 1), r('a', 'request_pending', 1), r('b', 'message', 5)])
    expect(groups.map(g => [g[0].recipient_id, g[0].kind, g.length])).toEqual([
      ['b', 'message', 1],
      ['a', 'message', 2],
      ['a', 'request_pending', 1],
    ])
  })
})
