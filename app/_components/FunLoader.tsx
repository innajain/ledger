'use client'

import { useEffect, useState, useCallback } from 'react'

const LOADING_MESSAGES = [
  'Crunching numbers... 🔢',
  'Counting your coins... 💰',
  'Balancing the books... 📚',
  'Fetching your data... 🚀',
  'Almost there... ⏳',
  'Just a moment... ⏱️',
  'Loading magic... ✨',
  'Preparing awesomeness... 🎉',
]

export function FunLoader({ message }: { message?: string }) {
  const getRandomMessage = useCallback(() => {
    return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]
  }, [])

  const [loadingMessage, setLoadingMessage] = useState(() => message || getRandomMessage())

  useEffect(() => {
    if (!message) {
      const interval = setInterval(() => {
        setLoadingMessage(getRandomMessage())
      }, 2000)

      return () => clearInterval(interval)
    }
  }, [message, getRandomMessage])

  return (
    <div className="flex flex-col items-center justify-center min-h-100 space-y-4">
      <div className="relative">
        {}
        <div className="w-16 h-16 border-4 border-blue-200 dark:border-blue-900 rounded-full animate-spin-slow"></div>

        {}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="w-8 h-8 bg-linear-to-r from-blue-500 to-purple-500 rounded-full animate-pulse"></div>
        </div>

        {}
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
          <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>

      <p className="text-slate-600 dark:text-slate-400 font-medium animate-pulse mt-8">{loadingMessage}</p>
    </div>
  )
}
