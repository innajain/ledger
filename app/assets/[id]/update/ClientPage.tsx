'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { update_asset } from '@/app/_actions/resources'
import type { Prisma, asset_type } from '@/generated/prisma/client'
import type { ActionResult } from '@/app/_actions/_result'
import {
  PageHeader,
  FormCard,
  TextInput,
  AssetTypeSelect,
  ParentAssetSelect,
  FormActions,
  ErrorAlert,
  ToggleSwitch,
} from '@/app/_components/FormComponents'

export default function ClientPage({
  asset,
  parents,
  deleteAsset,
}: {
  asset: Prisma.assetGetPayload<Record<string, never>>
  parents: { id: string; name: string }[]
  deleteAsset?: (id: string) => Promise<ActionResult>
}) {
  const router = useRouter()
  const [name, setName] = useState(asset.name)
  const [type, setType] = useState<asset_type>(asset.type)
  const [ticker, setTicker] = useState(asset.ticker ?? '')
  const [parentId, setParentId] = useState<string | null>(asset.parent_id ?? null)
  const [isActive, setIsActive] = useState(asset.is_active)
  const [isPlaceholder, setIsPlaceholder] = useState(asset.is_placeholder)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await update_asset(asset.id, name, type, ticker || undefined, parentId, isActive, isPlaceholder)
      if (!result.success) throw new Error(result.message)
      router.push('/assets')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!deleteAsset) {
      setError('Delete operation is not available')
      return
    }
    if (!confirm('Delete this asset? This action cannot be undone.')) return
    setError(null)
    try {
      const result = await deleteAsset(asset.id)
      if (!result.success) throw new Error(result.message)
      router.push('/assets')
    } catch (err: unknown) {
      setError('Delete failed: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader backLink="/assets" backText="Assets" title="Edit asset" description="Modify asset details or delete" />

      <form onSubmit={onUpdate} className="space-y-6">
        <FormCard title="Asset details">
          <TextInput label="Asset Name" value={name} onChange={setName} placeholder="Enter asset name" required />

          <AssetTypeSelect label="Asset Type" value={type} onChange={val => setType(val as asset_type)} />

          <TextInput label="Ticker (Optional)" value={ticker} onChange={setTicker} placeholder="e.g., AAPL, INFY" />

          <ParentAssetSelect
            label="Parent Asset (Optional)"
            value={parentId}
            onChange={setParentId}
            parents={parents}
            excludeId={asset.id}
            helpText="Select a parent to create a sub-asset"
          />

          <ToggleSwitch label="Active" helpText="Inactive assets are hidden from transaction selectors" value={isActive} onChange={setIsActive} />
          <ToggleSwitch
            label="Placeholder"
            helpText="Placeholder assets exist only to group sub-assets and are hidden from transaction selectors"
            value={isPlaceholder}
            onChange={setIsPlaceholder}
          />
        </FormCard>

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        <FormActions
          cancelLink="/assets"
          submitText={busy ? 'Updating…' : 'Update asset'}
          busy={busy}
          onDelete={deleteAsset ? onDelete : undefined}
          deleteText="Delete Asset"
        />
      </form>
    </div>
  )
}
