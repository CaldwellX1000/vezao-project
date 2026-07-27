'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Notification = {
  id: string
  user_id: string
  actor_id: string
  type: string
  video_id: string | null
  message: string | null
  is_read: boolean
  created_at: string
  actor?: {
    username: string | null
    full_name: string | null
    avatar_url: string | null
  } | null
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'baru saja'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}j`
  const day = Math.floor(hour / 24)
  if (day < 7) return `${day}h`
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
  })
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()

  const loadNotifications = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('notifications')
      .select(`
        id,
        user_id,
        actor_id,
        type,
        video_id,
        message,
        is_read,
        created_at
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!data || data.length === 0) {
      setNotifications([])
      return
    }

    const actorIds = [...new Set(data.map((n) => n.actor_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', actorIds)

    const withActor = data.map((n) => ({
      ...n,
      actor: profiles?.find((p) => p.id === n.actor_id) || null,
    }))

    setNotifications(withActor)
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setCurrentUserId(user.id)
      await loadNotifications(user.id)
      setLoading(false)

      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
    }

    init()
  }, [])

  useEffect(() => {
    if (!currentUserId) return
    const interval = setInterval(() => {
      loadNotifications(currentUserId)
    }, 8000)
    return () => clearInterval(interval)
  }, [currentUserId, loadNotifications])

  const getText = (n: Notification) => {
    const name = n.actor?.username || n.actor?.full_name || 'Seseorang'
    if (n.type === 'follow_request')
      return (
        <>
          <span className="font-semibold text-white">@{name}</span>
          {' meminta mengikuti kamu'}
        </>
      )
    if (n.type === 'follow')
      return (
        <>
          <span className="font-semibold text-white">@{name}</span>
          {' mulai mengikuti kamu'}
        </>
      )
    if (n.type === 'like')
      return (
        <>
          <span className="font-semibold text-white">@{name}</span>
          {' menyukai videomu'}
        </>
      )
    if (n.type === 'comment')
      return (
        <>
          <span className="font-semibold text-white">@{name}</span>
          {' mengomentari: '}
          <span className="text-gray-400">{n.message || '...'}</span>
        </>
      )
    return n.message || 'Notifikasi baru'
  }

  const typeIcon = (type: string) => {
    if (type === 'like') return '♥'
    if (type === 'comment') return '💬'
    if (type === 'follow' || type === 'follow_request') return '👤'
    return '🔔'
  }

  const handleAccept = async (n: Notification, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!currentUserId || actingId) return
    setActingId(n.id)

    // Insert follow
    await supabase.from('follows').insert({
      follower_id: n.actor_id,
      following_id: currentUserId,
    })

    // Update / hapus request
    await supabase
      .from('follow_requests')
      .delete()
      .eq('requester_id', n.actor_id)
      .eq('target_id', currentUserId)

    // Hapus notif request, buat notif follow biasa opsional
    await supabase.from('notifications').delete().eq('id', n.id)

    setNotifications((prev) => prev.filter((x) => x.id !== n.id))
    setActingId(null)
  }

  const handleDecline = async (n: Notification, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!currentUserId || actingId) return
    setActingId(n.id)

    await supabase
      .from('follow_requests')
      .delete()
      .eq('requester_id', n.actor_id)
      .eq('target_id', currentUserId)

    await supabase.from('notifications').delete().eq('id', n.id)

    setNotifications((prev) => prev.filter((x) => x.id !== n.id))
    setActingId(null)
  }

  const handleClick = (n: Notification) => {
    if (n.type === 'follow_request') {
      router.push(`/@${n.actor?.username || n.actor_id}`)
      return
    }
    if (n.type === 'follow') {
      router.push(`/@${n.actor?.username || n.actor_id}`)
      return
    }
    if (n.video_id) {
      router.push(`/v/${n.video_id}`)
      return
    }
    router.push(`/@${n.actor?.username || n.actor_id}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      <div className="sticky top-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/10 px-4 h-14 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-lg font-bold">
          ←
        </button>
        <h1 className="text-lg font-bold">Notifikasi</h1>
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center pt-32 text-gray-400 gap-2">
          <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center text-2xl">
            🔔
          </div>
          <p className="text-sm">Belum ada notifikasi</p>
          <p className="text-xs text-gray-600">Like, komentar & follow akan muncul di sini</p>
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-white/5 ${
                !n.is_read ? 'bg-purple-500/5' : ''
              }`}
            >
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden">
                  {n.actor?.avatar_url ? (
                    <img src={n.actor.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold bg-vezao-gradient">
                      {(n.actor?.username || 'U')[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-zinc-900 border border-black flex items-center justify-center text-[10px]">
                  {typeIcon(n.type)}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-300 leading-snug">{getText(n)}</p>
                <p className="text-[11px] text-gray-500 mt-1">{timeAgo(n.created_at)}</p>

                {n.type === 'follow_request' && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={(e) => handleAccept(n, e)}
                      disabled={actingId === n.id}
                      className="px-4 py-1.5 rounded-full bg-vezao-gradient text-xs font-semibold disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      onClick={(e) => handleDecline(n, e)}
                      disabled={actingId === n.id}
                      className="px-4 py-1.5 rounded-full bg-zinc-800 border border-white/10 text-xs font-semibold disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>

              {!n.is_read && n.type !== 'follow_request' && (
                <div className="w-2 h-2 rounded-full bg-vezao-gradient shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-black/95 border-t border-white/10 h-16 flex items-center justify-around z-50 backdrop-blur-md">
        <button onClick={() => router.push('/')} className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
          </svg>
          <span className="text-[11px] text-gray-400">Home</span>
        </button>

        <button onClick={() => router.push('/search')} className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="text-[11px] text-gray-400">Search</span>
        </button>

        <button onClick={() => router.push('/upload')} className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-[11px] text-gray-400">Upload</span>
        </button>

        <button onClick={() => router.push('/inbox')} className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span className="text-[11px] text-gray-400">Inbox</span>
        </button>

        <button onClick={() => router.push('/profile')} className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-[11px] text-gray-400">Profile</span>
        </button>
      </div>
    </div>
  )
}