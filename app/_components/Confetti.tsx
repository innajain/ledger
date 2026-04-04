'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

interface ConfettiProps {
  active: boolean
  duration?: number
  particleCount?: number
}

export function Confetti({ active, duration = 3000, particleCount = 50 }: ConfettiProps) {
  const [particles, setParticles] = useState<Array<{ id: number; left: number; color: string; delay: number }>>([])
  const particlesGenerated = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const generateParticles = useCallback(() => {
    const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4']
    return Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.5,
    }))
  }, [particleCount])

  useEffect(() => {
    if (active && !particlesGenerated.current) {
      particlesGenerated.current = true
      // Use setTimeout to avoid synchronous setState in effect
      timerRef.current = setTimeout(() => {
        setParticles(generateParticles())
      }, 0)

      const durationTimer = setTimeout(() => {
        setParticles([])
        particlesGenerated.current = false
      }, duration)

      return () => {
        if (timerRef.current) clearTimeout(timerRef.current)
        clearTimeout(durationTimer)
      }
    } else if (!active) {
      // Use setTimeout to avoid synchronous setState in effect
      setTimeout(() => {
        setParticles([])
        particlesGenerated.current = false
      }, 0)
    }
  }, [active, duration, generateParticles])

  if (!active || particles.length === 0) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-50" aria-hidden="true">
      {particles.map(particle => (
        <div
          key={particle.id}
          className="confetti-piece"
          style={{
            left: `${particle.left}%`,
            top: '-10px',
            backgroundColor: particle.color,
            animationDelay: `${particle.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
