'use client'

import { useEffect } from 'react'
import { report_client_error } from '@/app/_utils/report_client_error'
import { Button } from '@/app/_components/Button'
import { WarningIcon } from '@/app/_components/icons'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    report_client_error(error)
  }, [error])

  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md">
        <div className="flex justify-center">
          <WarningIcon className="w-10 h-10 text-amber-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Something went wrong</h2>
        <p className="text-slate-600 dark:text-slate-400">{error.message || 'An unexpected error occurred'}</p>
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  )
}
