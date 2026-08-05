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
          const raw = localStorage.getItem('vezao_notif_prefs')
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

  const itemClass = (path: string) =>
    isActive(path) ? 'text-white' : 'text-gray-400'

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#0b0614]/95 border-t border-purple-500/25 h-16 flex items-center justify-around z-50">
      <Link href="/" className="flex flex-col items-center gap-0.5">
        <img
          src="/home.png"
          alt=""
          className={`w-30 h-6 object-contain ${isActive('/') ? 'opacity-100' : 'opacity-55'}`}
        />
        <span className={`text-[11px] ${itemClass('/')}`}>Home</span>
      </Link>

      <Link href="/search" className="flex flex-col items-center gap-0.5">
        <img
          src="/pencarian.png"
          alt=""
          className={`w-30 h-6 object-contain ${isActive('/search') ? 'opacity-100' : 'opacity-55'}`}
        />
        <span className={`text-[11px] ${itemClass('/search')}`}>Search</span>
      </Link>

      <Link href="/upload" className="flex flex-col items-center gap-0.5">
        <img
          src="/upload.png"
          alt=""
          className={`w-30 h-6 object-contain ${isActive('/upload') ? 'opacity-100' : 'opacity-55'}`}
        />
        <span className={`text-[11px] ${itemClass('/upload')}`}>Upload</span>
      </Link>

      <Link href="/inbox" className="flex flex-col items-center gap-0.5 relative">
        <div className="relative">
          <img
            src="/inbox.png"
            alt=""
            className={`w-30 h-6 object-contain ${isActive('/inbox') ? 'opacity-100' : 'opacity-55'}`}
          />
          {inboxHasAlert && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-vezao-gradient" />
          )}
        </div>
        <span className={`text-[11px] ${itemClass('/inbox')}`}>Inbox</span>
      </Link>

      <Link href="/profile" className="flex flex-col items-center gap-0.5">
        <img
          src="/profile.png"
          alt=""
          className={`w-30 h-6 object-contain ${isActive('/profile') ? 'opacity-100' : 'opacity-55'}`}
        />
        <span className={`text-[11px] ${itemClass('/profile')}`}>Profile</span>
      </Link>
    </div>
  )
}