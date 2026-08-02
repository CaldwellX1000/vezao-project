'use client'

import { useEffect, useState } from 'react'

type ToastItem = {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent).detail || {}
      const id = Date.now() + Math.random()
      setItems((prev) => [
        ...prev,
        {
          id,
          message: detail.message || '',
          type: detail.type || 'info',
        },
      ])
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id))
      }, 2800)
    }

    window.addEventListener('vezao-toast', onToast as EventListener)
    return () => window.removeEventListener('vezao-toast', onToast as EventListener)
  }, [])

  if (items.length === 0) return null

  return (
    <div className="fixed top-14 left-0 right-0 z-[200] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto max-w-sm w-full text-center text-sm px-4 py-2.5 rounded-full shadow-lg border backdrop-blur-md ${
            t.type === 'success'
              ? 'bg-green-500/20 border-green-500/30 text-green-300'
              : t.type === 'error'
              ? 'bg-red-500/20 border-red-500/30 text-red-300'
              : 'bg-zinc-900/95 border-white/10 text-white'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}