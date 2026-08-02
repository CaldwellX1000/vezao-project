'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { toast } from '@/lib/toast'

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
type NotifPrefs = {
  likes: boolean
  comments: boolean
  follows: boolean
  messages: boolean
}

const DEFAULT_NOTIF: NotifPrefs = {
  likes: true,
  comments: true,
  follows: true,
  messages: true,
}

function getNotifPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem('vezao_notif_prefs')
    if (raw) return { ...DEFAULT_NOTIF, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULT_NOTIF }
}

function isNotifAllowed(type: string, prefs: NotifPrefs) {
  const t = (type || '').toLowerCase()
  if (t === 'like' || t === 'save') return prefs.likes
  if (t === 'comment' || t === 'mention') return prefs.comments
  if (t === 'follow' || t === 'follow_request') return prefs.follows
  if (t === 'message') return prefs.messages
  return true
}
function formatDateTime(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()

  const time = d.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  if (sameDay) return `Hari ini ${time}`

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()

  if (isYesterday) return `Kemarin ${time}`

  return (
    d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    }) +
    ' · ' +
    time
  )
}

function TypeIcon({ type }: { type: string }) {
  if (type === 'like') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-3 h-3 text-red-400" fill="currentColor">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    )
  }
  if (type === 'comment') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="w-3 h-3 text-blue-400"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    )
  }
  if (type === 'save') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-3 h-3 text-yellow-400" fill="currentColor">
        <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    )
  }
  if (type === 'share') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="w-3 h-3 text-purple-400"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"
        />
      </svg>
    )
  }
  if (type === 'mention') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="w-3 h-3 text-cyan-400"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
        />
      </svg>
    )
  }
  if (type === 'follow' || type === 'follow_request') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="w-3 h-3 text-white"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
    )
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="w-3 h-3 text-gray-400"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  )
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [followedBack, setFollowedBack] = useState<Set<string>>(new Set())

  const router = useRouter()
  const supabase = createClient()

  const loadNotifications = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('notifications')
      .select(
        `
        id,
        user_id,
        actor_id,
        type,
        video_id,
        message,
        is_read,
        created_at
      `
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!data || data.length === 0) {
      setNotifications([])
      setFollowedBack(new Set())
      return
    }

    const actorIds = [...new Set(data.map((n) => n.actor_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', actorIds)

    const prefs = getNotifPrefs()

    const withActor = data
      .filter((n) => isNotifAllowed(n.type, prefs))
      .map((n) => ({
        ...n,
        actor: profiles?.find((p) => p.id === n.actor_id) || null,
      }))

    setNotifications(withActor)

    // Siapa yang sudah kita follow → tombol Following
    if (actorIds.length > 0) {
      const { data: myFollows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId)
        .in('following_id', actorIds)

      setFollowedBack(new Set((myFollows || []).map((f) => f.following_id)))
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setCurrentUserId(user.id)
      await loadNotifications(user.id)
      setLoading(false)
    }

    init()
  }, [])

  useEffect(() => {
    if (!currentUserId) return

    const channel = supabase
      .channel(`notif-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          loadNotifications(currentUserId)
        }
      )
      .subscribe()

    const interval = setInterval(() => {
      loadNotifications(currentUserId)
    }, 15000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
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
    if (n.type === 'save')
      return (
        <>
          <span className="font-semibold text-white">@{name}</span>
          {' menyimpan videomu'}
        </>
      )
    if (n.type === 'share')
      return (
        <>
          <span className="font-semibold text-white">@{name}</span>
          {' membagikan videomu'}
        </>
      )
    if (n.type === 'mention')
      return (
        <>
          <span className="font-semibold text-white">@{name}</span>
          {n.video_id ? ' mention kamu di video: ' : ' mention kamu di story: '}
          <span className="text-gray-400">{n.message || '...'}</span>
        </>
      )
    return (
      <>
        <span className="font-semibold text-white">@{name}</span>
        {' mengirim notifikasi'}
      </>
    )
  }

  const handleAccept = async (n: Notification, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!currentUserId || actingId) return
    setActingId(n.id)

    await supabase.from('follows').insert({
      follower_id: n.actor_id,
      following_id: currentUserId,
    })

    await supabase
      .from('follow_requests')
      .delete()
      .eq('requester_id', n.actor_id)
      .eq('target_id', currentUserId)

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

  const handleFollowBack = async (n: Notification, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!currentUserId || actingId) return
    setActingId(n.id)

    const { error } = await supabase.from('follows').insert({
      follower_id: currentUserId,
      following_id: n.actor_id,
    })

    if (error && !String(error.message).toLowerCase().includes('duplicate')) {
      toast('Gagal follow: ' + error.message, 'error')
      setActingId(null)
      return
    }

    // Notif ke dia
    await supabase.from('notifications').insert({
      user_id: n.actor_id,
      actor_id: currentUserId,
      type: 'follow',
      video_id: null,
      message: null,
      is_read: false,
    })

    // JANGAN hapus notif — hanya tandai Following
    setFollowedBack((prev) => new Set(prev).add(n.actor_id))
    setActingId(null)
  }

  const handleDismiss = async (n: Notification, e: React.MouseEvent) => {
    e.stopPropagation()
    if (actingId) return
    setActingId(n.id)
    await supabase.from('notifications').delete().eq('id', n.id)
    setNotifications((prev) => prev.filter((x) => x.id !== n.id))
    setActingId(null)
  }

  const markAllRead = async () => {
    if (!currentUserId) return
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id)
    if (unreadIds.length === 0) return
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', currentUserId)
      .eq('is_read', false)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  const handleClick = async (n: Notification) => {
    if (!n.is_read) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', n.id)
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
      )
    }

    if (n.type === 'follow_request' || n.type === 'follow') {
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
        <h1 className="text-lg font-bold flex-1">Notifikasi</h1>
        {notifications.some((n) => !n.is_read) && (
          <button
            onClick={markAllRead}
            className="text-xs text-purple-400 font-medium"
          >
            Tandai dibaca
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center pt-32 text-gray-400 gap-2">
          <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center text-2xl">
            🔔
          </div>
          <p className="text-sm">Belum ada notifikasi</p>
          <p className="text-xs text-gray-600">
            Like, save, share, komentar & follow muncul di sini
          </p>
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
                    <img
                      src={n.actor.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold bg-vezao-gradient">
                      {(n.actor?.username || 'U')[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-zinc-900 border border-black flex items-center justify-center">
                  <TypeIcon type={n.type} />
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-300 leading-snug">{getText(n)}</p>
                <p className="text-[11px] text-gray-500 mt-1">
                  {formatDateTime(n.created_at)}
                </p>

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

                {n.type === 'follow' && (
                  <div className="flex gap-2 mt-2">
                    {followedBack.has(n.actor_id) ? (
                      <span className="px-4 py-1.5 rounded-full bg-zinc-800 border border-white/10 text-xs font-semibold text-gray-300">
                        Following
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={(e) => handleFollowBack(n, e)}
                          disabled={actingId === n.id}
                          className="px-4 py-1.5 rounded-full bg-vezao-gradient text-xs font-semibold disabled:opacity-50"
                        >
                          Follow Back
                        </button>
                        <button
                          onClick={(e) => handleDismiss(n, e)}
                          disabled={actingId === n.id}
                          className="px-4 py-1.5 rounded-full bg-zinc-800 border border-white/10 text-xs font-semibold disabled:opacity-50"
                        >
                          Hapus
                        </button>
                      </>
                    )}
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

      <BottomNav />
    </div>
  )
}