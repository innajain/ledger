'use client'

import { useState, useRef } from 'react'
import type { AttachmentInput } from '@/app/_actions/attachments'

type ExistingAttachment = {
  id: string
  url: string // presigned GET URL generated server-side at render time
  filename: string
  content_type: string | null
  size: number | null
}

type PendingAttachment = AttachmentInput & { preview_url: string }

type Props = {
  existingAttachments?: ExistingAttachment[]
  onPendingChange: (pending: AttachmentInput[]) => void
  onDeleteExisting?: (id: string) => Promise<void>
}

function FileIcon({ content_type }: { content_type: string | null }) {
  if (content_type?.startsWith('image/'))
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    )
  if (content_type === 'application/pdf')
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
    )
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
      />
    </svg>
  )
}

function fmt_size(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function AttachmentUpload({ existingAttachments = [], onPendingChange, onDeleteExisting }: Props) {
  const [pending, setPending] = useState<PendingAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [existing, setExisting] = useState(existingAttachments)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadError(null)
    setUploading(true)
    const uploaded: PendingAttachment[] = []
    try {
      for (const file of Array.from(files)) {
        const meta = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, content_type: file.type, size: file.size }),
        })
        if (!meta.ok) {
          const data = await meta.json()
          throw new Error(data.error ?? 'Upload failed')
        }
        const { presigned_url, pathname } = (await meta.json()) as { presigned_url: string; pathname: string }
        const put = await fetch(presigned_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
        if (!put.ok) throw new Error('Upload to storage failed')
        uploaded.push({ pathname, filename: file.name, content_type: file.type || null, size: file.size, preview_url: URL.createObjectURL(file) })
      }
      const next = [...pending, ...uploaded]
      setPending(next)
      onPendingChange(next.map(({ preview_url: _p, ...a }) => a))
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function removePending(idx: number) {
    const next = pending.filter((_, i) => i !== idx)
    setPending(next)
    onPendingChange(next.map(({ preview_url: _p, ...a }) => a))
  }

  async function handleDeleteExisting(id: string) {
    if (!onDeleteExisting) return
    setDeletingId(id)
    try {
      await onDeleteExisting(id)
      setExisting(prev => prev.filter(a => a.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  const hasAny = existing.length > 0 || pending.length > 0

  return (
    <div className="space-y-3">
      {hasAny && (
        <div className="space-y-2">
          {existing.map(att => (
            <div
              key={att.id}
              className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600"
            >
              <span className="text-slate-500 dark:text-slate-400 shrink-0">
                <FileIcon content_type={att.content_type} />
              </span>
              {att.content_type?.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={att.url} alt={att.filename} className="h-10 w-10 object-cover rounded shrink-0" />
              ) : null}
              <div className="flex-1 min-w-0">
                <a
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline truncate block"
                >
                  {att.filename}
                </a>
                {att.size && <p className="text-xs text-slate-400">{fmt_size(att.size)}</p>}
              </div>
              {onDeleteExisting && (
                <button
                  type="button"
                  onClick={() => handleDeleteExisting(att.id)}
                  disabled={deletingId === att.id}
                  className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 shrink-0"
                  title="Remove attachment"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}

          {pending.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
            >
              <span className="text-blue-500 shrink-0">
                <FileIcon content_type={att.content_type} />
              </span>
              {att.content_type?.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={att.preview_url} alt={att.filename} className="h-10 w-10 object-cover rounded shrink-0" />
              ) : null}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{att.filename}</p>
                {att.size && <p className="text-xs text-slate-400">{fmt_size(att.size)}</p>}
              </div>
              <button
                type="button"
                onClick={() => removePending(idx)}
                className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 shrink-0"
                title="Remove"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 cursor-pointer group" onClick={() => !uploading && inputRef.current?.click()}>
        <input ref={inputRef} type="file" multiple accept="image/*,.pdf,.txt" className="hidden" onChange={e => handleFiles(e.target.files)} />
        <div className="flex items-center gap-2 px-4 py-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-500 dark:text-slate-400 group-hover:border-blue-400 group-hover:text-blue-500 dark:group-hover:border-blue-500 dark:group-hover:text-blue-400 transition-colors">
          {uploading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Uploading...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
              Attach files (images, PDF, TXT — max 10 MB each)
            </>
          )}
        </div>
      </div>

      {uploadError && <p className="text-sm text-red-600 dark:text-red-400">{uploadError}</p>}
    </div>
  )
}
