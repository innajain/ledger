'use client'

import { useState, useRef } from 'react'
import type { AttachmentInput } from '@/app/_actions/attachments'
import { format_bytes } from '@/app/_utils/format_bytes'

type ExistingAttachment = {
  id: string
  url: string
  filename: string
  content_type: string | null
  size: number | null
}

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

export function AttachmentUpload({ existingAttachments = [], onPendingChange, onDeleteExisting }: Props) {
  const [pending, setPending] = useState<AttachmentInput[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [existing, setExisting] = useState(existingAttachments)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadError(null)
    setUploading(true)
    try {
      // Loaded on first file pick — the blob client SDK doesn't belong in the form's
      // initial bundle when most visits never attach a file.
      const { upload } = await import('@vercel/blob/client')
      // Parallel: each upload is two round trips (token handshake + PUT). The index keeps
      // pathnames unique — concurrent uploads share the same Date.now() millisecond.
      const uploaded: AttachmentInput[] = await Promise.all(
        Array.from(files).map(async (file, i) => {
          const blob = await upload(`attachments/${Date.now()}-${i}-${file.name}`, file, {
            access: 'private',
            handleUploadUrl: '/api/upload',
          })
          return { url: blob.url, pathname: blob.pathname, filename: file.name, content_type: file.type || null, size: file.size }
        }),
      )
      const next = [...pending, ...uploaded]
      setPending(next)
      onPendingChange(next)
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
    onPendingChange(next)
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
                {att.size && <p className="text-xs text-slate-500 dark:text-slate-400">{format_bytes(att.size)}</p>}
              </div>
              {onDeleteExisting && (
                <button
                  type="button"
                  onClick={() => handleDeleteExisting(att.id)}
                  disabled={deletingId === att.id}
                  className="p-2 -m-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 shrink-0"
                  title="Remove attachment"
                  aria-label={`Remove attachment ${att.filename}`}
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
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{att.filename}</p>
                {att.size && <p className="text-xs text-slate-500 dark:text-slate-400">{format_bytes(att.size)}</p>}
              </div>
              <button
                type="button"
                onClick={() => removePending(idx)}
                className="p-2 -m-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 shrink-0"
                title="Remove"
                aria-label={`Remove pending attachment ${att.filename}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="flex items-center gap-3 group" onClick={() => !uploading && inputRef.current?.click()} disabled={uploading}>
        <input ref={inputRef} type="file" multiple accept="image/*,.pdf,.txt,.json" className="hidden" onChange={e => handleFiles(e.target.files)} />
        <span className="flex items-center gap-2 px-4 py-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-500 dark:text-slate-400 group-hover:border-blue-400 group-hover:text-blue-500 dark:group-hover:border-blue-500 dark:group-hover:text-blue-400 transition-colors">
          {uploading ? (
            <>
              <svg aria-hidden="true" className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Uploading…
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
              Attach files (images, PDF, TXT, JSON — max 10 MB each)
            </>
          )}
        </span>
      </button>

      {uploadError && <p className="text-sm text-red-600 dark:text-red-400">{uploadError}</p>}
    </div>
  )
}
