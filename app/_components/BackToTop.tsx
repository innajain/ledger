'use client'

import { useEffect, useState } from 'react'

export function BackToTop() {
  const [isVisible, setIsVisible] = useState(false)
  // How far the footer has risen into the viewport. The button rides up by that much, so
  // at the bottom of a page it sits above the footer instead of over its links.
  const [lift, setLift] = useState(0)

  useEffect(() => {
    const update = () => {
      setIsVisible(window.scrollY > 300)
      const footer = document.querySelector('[data-site-footer]')
      setLift(footer ? Math.max(0, Math.round(window.innerHeight - footer.getBoundingClientRect().top)) : 0)
    }

    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  if (!isVisible) {
    return null
  }

  return (
    <button
      onClick={scrollToTop}
      // margin, not transform: the entrance animation owns `transform` while it runs.
      style={lift > 0 ? { marginBottom: lift } : undefined}
      className="fixed bottom-4 right-4 sm:bottom-8 sm:right-8 z-40 p-3 bg-blue-600 dark:bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors animate-slide-in-up"
      aria-label="Back to top"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
    </button>
  )
}
