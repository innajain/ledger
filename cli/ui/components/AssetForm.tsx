import React, { useState } from 'react'
import { Box, Text } from 'ink'
import type { asset_type } from '@/generated/prisma/client'
import { create_asset_core, update_asset_core } from '@/app/_core/resources_core'
import type { ActionResult } from '@/app/_actions/_result'
import { Panel } from './Panel'
import { Picker, type PickItem } from './Picker'
import { TextField, Confirm } from './Field'

export type AssetEdit = { id: string; name: string; type: asset_type; ticker: string | null; is_active: boolean }

const TYPE_ITEMS: PickItem[] = ['rupees', 'mf', 'etf', 'shares', 'other'].map(t => ({ id: t, name: t }))
const needsTicker = (t: string) => t === 'mf' || t === 'etf' || t === 'shares'

type Phase = 'name' | 'type' | 'ticker' | 'active' | 'saving'

export function AssetForm({ edit, onDone, onCancel }: { edit?: AssetEdit; onDone: (r: ActionResult<unknown>) => void; onCancel: () => void }) {
  const [phase, setPhase] = useState<Phase>('name')
  const [name, setName] = useState(edit?.name ?? '')
  const [type, setType] = useState<asset_type | null>(edit?.type ?? null)
  const [tickerStr, setTickerStr] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const submit = async (opts: { ticker?: string | null; isActive?: boolean }) => {
    setPhase('saving')
    if (edit) onDone(await update_asset_core(edit.id, name, edit.type, opts.ticker, undefined, opts.isActive))
    else onDone(await create_asset_core(name, type as asset_type, opts.ticker ?? null))
  }

  return (
    <Panel title={edit ? `Edit asset — ${edit.name}` : 'New asset'} color="blue">
      {phase === 'name' && (
        <TextField
          label="Name"
          value={name}
          onChange={setName}
          onSubmit={v =>
            v.trim() === ''
              ? setErr('Name is required')
              : (setErr(null), setName(v.trim()), setPhase(edit ? (needsTicker(edit.type) ? 'ticker' : 'active') : 'type'))
          }
        />
      )}

      {phase === 'type' && (
        <Picker
          label="Type"
          items={TYPE_ITEMS}
          onSelect={t => {
            setType(t.id as asset_type)
            if (needsTicker(t.id)) setPhase('ticker')
            else void submit({ ticker: null })
          }}
          onCancel={onCancel}
        />
      )}

      {phase === 'ticker' && (
        <TextField
          label={edit ? 'Ticker (blank = keep)' : 'Ticker'}
          value={tickerStr}
          onChange={setTickerStr}
          onSubmit={v => {
            const t = v.trim()
            if (!edit && t === '') return setErr('Ticker is required for this asset type')
            setErr(null)
            if (edit) setPhase('active')
            else void submit({ ticker: t })
          }}
        />
      )}

      {phase === 'active' && (
        <Confirm message="Active?" onAnswer={yes => void submit({ ticker: tickerStr.trim() === '' ? undefined : tickerStr.trim(), isActive: yes })} />
      )}

      {phase === 'saving' && <Text color="yellow">Saving…</Text>}

      {err && <Text color="red">{err}</Text>}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          enter to continue · esc to cancel
        </Text>
      </Box>
    </Panel>
  )
}
