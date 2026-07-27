'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function BottomNav() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [inboxUnread, setInboxUnread] = useState(0)

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('is_read', false)

      setInboxUnread(count || 0)
    }

    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [])

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  const itemClass = (path: string) =>
    isActive(path) ? 'text-white' : 'text-gray-400'

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-black/95 border-t border-white/10 h-16 flex items-center justify-around z-50 backdrop-blur-md">
      <button onClick={() => router.push('/')} className="flex flex-col items-center gap-0.5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-6 h-6 ${itemClass('/')}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"
          />
        </svg>
        <span className={`text-[11px] ${itemClass('/')}`}>Home</span>
      </button>

      <button onClick={() => router.push('/search')} className="flex flex-col items-center gap-0.5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-6 h-6 ${itemClass('/search')}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <span className={`text-[11px] ${itemClass('/search')}`}>Search</span>
      </button>

      <button onClick={() => router.push('/upload')} className="flex flex-col items-center gap-0.5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-6 h-6 ${itemClass('/upload')}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        <span className={`text-[11px] ${itemClass('/upload')}`}>Upload</span>
      </button>

      <button
        onClick={() => router.push('/inbox')}
        className="flex flex-col items-center gap-0.5 relative"
      >
        <div className="relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-6 h-6 ${itemClass('/inbox')}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
          {inboxUnread > 0 && (
            <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-vezao-gradient text-[10px] font-bold flex items-center justify-center text-white">
              {inboxUnread > 99 ? '99+' : inboxUnread}
            </span>
          )}
        </div>
        <span className={`text-[11px] ${itemClass('/inbox')}`}>Inbox</span>
      </button>

      <button onClick={() => router.push('/profile')} className="flex flex-col items-center gap-0.5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-6 h-6 ${itemClass('/profile')}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
        <span className={`text-[11px] ${itemClass('/profile')}`}>Profile</span>
      </button>
    </div>
  )
}