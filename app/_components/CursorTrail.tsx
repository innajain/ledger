'use client';

import { useEffect, useState } from 'react';

interface Trail {
  id: number;
  x: number;
  y: number;
}

export function CursorTrail({ enabled = false }: { enabled?: boolean }) {
  const [trail, setTrail] = useState<Trail[]>([]);
  const [nextId, setNextId] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newTrail: Trail = {
        id: nextId,
        x: e.clientX,
        y: e.clientY,
      };

      setTrail(prev => [...prev.slice(-20), newTrail]);
      setNextId(prev => prev + 1);
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [enabled, nextId]);

  useEffect(() => {
    if (trail.length > 0) {
      const timer = setTimeout(() => {
        setTrail(prev => prev.slice(1));
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [trail]);

  if (!enabled) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50" aria-hidden="true">
      {trail.map((point, index) => (
        <div
          key={point.id}
          className="absolute w-2 h-2 rounded-full bg-blue-500/50 animate-ping"
          style={{
            left: `${point.x}px`,
            top: `${point.y}px`,
            opacity: index / trail.length,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
    </div>
  );
}
