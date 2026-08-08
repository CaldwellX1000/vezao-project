'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'

let cachedAlert: boolean | null = null
let lastFetch = 0
const CACHE_MS = 25_000 // 25 detik

export default function BottomNav() {
  const pathname = usePathname()
  const supabase = createClient()
  const [inboxHasAlert, setInboxHasAlert] = useState(cachedAlert ?? false)
  const loadingRef = useRef(false)

  useEffect(() => {
    const load = async (force = false) => {
      const now = Date.now()
      if (!force && cachedAlert !== null && now - lastFetch < CACHE_MS) {
        setInboxHasAlert(cachedAlert)
        return
      }

      if (loadingRef.current) return
      loadingRef.current = true

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          cachedAlert = false
          setInboxHasAlert(false)
          return
        }

        // Ambil blocks (masih dibutuhkan)
        const { data: myBlocks } = await supabase
          .from('blocks')
          .select('blocker_id, blocked_id')
          .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`)

        const blockedSet = new Set<string>()
        ;(myBlocks || []).forEach((b) => {
          if (b.blocker_id === user.id) blockedSet.add(b.blocked_id)
          if (b.blocked_id === user.id) blockedSet.add(b.blocker_id)
        })

        // Unread messages (lebih hemat)
        const { data: unreadMsgs } = await supabase
          .from('messages')
          .select('sender_id')
          .eq('receiver_id', user.id)
          .eq('is_read', false)
          .limit(15)

        const hasChat = (unreadMsgs || []).some((m) => !blockedSet.has(m.sender_id))

        // Unread notifications
        const { data: notifs } = await supabase
          .from('notifications')
          .select('type, actor_id')
          .eq('user_id', user.id)
          .eq('is_read', false)
          .limit(20)

        let prefs = { likes: true, comments: true, follows: true, messages: true }
        try {
          const raw = localStorage.getItem('serulo_notif_prefs')
          if (raw) prefs = { ...prefs, ...JSON.parse(raw) }
        } catch {}

        const allowed = (type: string) => {
          const t = (type || '').toLowerCase()
          if (t === 'like' || t === 'save' || t === 'share') return prefs.likes
          if (t === 'comment' || t === 'mention') return prefs.comments
          if (t === 'follow' || t === 'follow_request') return prefs.follows
          if (t === 'message') return prefs.messages
          return true
        }

        const hasNotif = (notifs || []).some(
          (n) => !blockedSet.has(n.actor_id) && allowed(n.type)
        )

        const result = hasChat || hasNotif
        cachedAlert = result
        lastFetch = Date.now()
        setInboxHasAlert(result)
      } finally {
        loadingRef.current = false
      }
    }

    load()

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 30000)

    const onFocus = () => load(true) // force refresh pas balik ke app
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  const iconClass = (path: string) =>
    isActive(path) ? 'text-white' : 'text-white/40'

  const labelClass = (path: string) =>
    isActive(path) ? 'text-pink-400 font-semibold' : 'text-white/40'

   return (
    <div className="fixed bottom-0 left-0 right-0 bg-black/95 border-t border-white/10 h-16 flex items-center justify-around z-50">
      <Link href="/" className="flex flex-col items-center gap-0.5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-6 h-6 ${iconClass('/')}`}
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
        <span className={`text-[11px] ${labelClass('/')}`}>Home</span>
      </Link>

      <Link href="/search" className="flex flex-col items-center gap-0.5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-6 h-6 ${iconClass('/search')}`}
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
        <span className={`text-[11px] ${labelClass('/search')}`}>Search</span>
      </Link>

      <Link href="/upload" className="flex flex-col items-center gap-0.5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-6 h-6 ${iconClass('/upload')}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        <span className={`text-[11px] ${labelClass('/upload')}`}>Upload</span>
      </Link>

      <Link href="/inbox" className="flex flex-col items-center gap-0.5 relative">
        <div className="relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-6 h-6 ${iconClass('/inbox')}`}
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
          {inboxHasAlert && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-vezao-gradient" />
          )}
        </div>
        <span className={`text-[11px] ${labelClass('/inbox')}`}>Inbox</span>
      </Link>

      <Link href="/profile" className="flex flex-col items-center gap-0.5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-6 h-6 ${iconClass('/profile')}`}
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
        <span className={`text-[11px] ${labelClass('/profile')}`}>Profile</span>
      </Link>
     </div>
  )
}