'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import StoryBar from '@/components/StoryBar'
import { insertNotification } from '@/lib/notify'
import { toast } from '@/lib/toast'

type Conversation = {
  userId: string
  username: string
  fullName: string
  avatarUrl: string | null
  lastMessage: string
  lastMessageTime: string
  hasUnread: boolean
  unreadCount: number
}

function formatLastMessage(content: string) {
  if (content.startsWith('__VIDEO__:')) return 'Membagikan video'
  if (content.startsWith('__IMAGE__:')) return 'Mengirim foto'
  if (content.startsWith('__VIDEO_FILE__:')) return 'Mengirim video'
  if (content.startsWith('__STICKER__:')) return 'Mengirim stiker'
  if (content.startsWith('__STORY__:')) {
    const text = content.split('\n').slice(1).join(' ').trim()
    return text
      ? `Berkomentar tentang story anda: ${text}`
      : 'Berkomentar tentang story anda'
  }
  return content
}

function formatInboxTime(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Date.now() - d.getTime()
  const sec = Math.floor(diff / 1000)

  if (sec < 60) return 'Baru saja'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}j`

  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  if (sameDay) {
    return d.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
  })
}

type NotifItem = {
  id: string
  type: string
  video_id: string | null
  message: string | null
  is_read: boolean
  created_at: string
  actor_id: string
  actor?: {
    username: string | null
    full_name: string | null
    avatar_url: string | null
  } | null
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [totalUnread, setTotalUnread] = useState(0)
  const [menuUserId, setMenuUserId] = useState<string | null>(null)
  const [notifUnread, setNotifUnread] = useState(0)
  const [tab, setTab] = useState<'messages' | 'activity'>('messages')
  const [notifications, setNotifications] = useState<NotifItem[]>([])
  const [loadingNotif, setLoadingNotif] = useState(false)
  const [followedBack, setFollowedBack] = useState<Set<string>>(new Set())
  const [actingId, setActingId] = useState<string | null>(null)
  const [chatQuery, setChatQuery] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [newChatQuery, setNewChatQuery] = useState('')
  const [newChatList, setNewChatList] = useState<
    { id: string; username: string | null; full_name: string | null; avatar_url: string | null }[]
  >([])
  const [loadingNewChat, setLoadingNewChat] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  const loadConversations = useCallback(async (userId: string) => {
    const { data: rawMessages } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, content, created_at, is_read, deleted_for')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false })

    const messages = (rawMessages || []).filter((m) => {
      const deletedFor: string[] = m.deleted_for || []
      return !deletedFor.includes(userId)
    })

    if (messages.length === 0) {
      setConversations([])
      setTotalUnread(0)
      return
    }

    const partnerIds = new Set<string>()
    messages.forEach((msg) => {
      const partnerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id
      partnerIds.add(partnerId)
    })

    const { data: myBlocks } = await supabase
      .from('blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`)

    const blockedSet = new Set<string>()
    ;(myBlocks || []).forEach((b) => {
      if (b.blocker_id === userId) blockedSet.add(b.blocked_id)
      if (b.blocked_id === userId) blockedSet.add(b.blocker_id)
    })

    blockedSet.forEach((id) => partnerIds.delete(id))

    const unread = messages.filter(
      (m) =>
        m.receiver_id === userId &&
        m.is_read === false &&
        !blockedSet.has(m.sender_id)
    ).length
    setTotalUnread(unread)

    if (partnerIds.size === 0) {
      setConversations([])
      setTotalUnread(0)
      return
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', Array.from(partnerIds))

    const convList: Conversation[] = []

    partnerIds.forEach((partnerId) => {
      const profile = profiles?.find((p) => p.id === partnerId)
      const lastMsg = messages.find(
        (m) =>
          (m.sender_id === userId && m.receiver_id === partnerId) ||
          (m.sender_id === partnerId && m.receiver_id === userId)
      )

      const unreadCount = messages.filter(
        (m) =>
          m.sender_id === partnerId &&
          m.receiver_id === userId &&
          m.is_read === false
      ).length

      if (profile && lastMsg) {
        convList.push({
          userId: partnerId,
          username: profile.username || 'user',
          fullName: profile.full_name || profile.username || 'user',
          avatarUrl: profile.avatar_url,
          lastMessage: formatLastMessage(lastMsg.content),
          lastMessageTime: lastMsg.created_at,
          hasUnread: unreadCount > 0,
          unreadCount,
        })
      }
    })

    convList.sort(
      (a, b) =>
        new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    )

    setConversations(convList)
  }, [])

  const loadNotifications = useCallback(async (userId: string) => {
    setLoadingNotif(true)

    // Blokir 2 arah → user B tidak muncul di notif A (dan sebaliknya)
    const { data: myBlocks } = await supabase
      .from('blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`)

    const blockedSet = new Set<string>()
    ;(myBlocks || []).forEach((b) => {
      if (b.blocker_id === userId) blockedSet.add(b.blocked_id)
      if (b.blocked_id === userId) blockedSet.add(b.blocker_id)
    })

    // Preferensi Settings (localStorage)
    let prefs = {
      likes: true,
      comments: true,
      follows: true,
      messages: true,
    }
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

    const { data } = await supabase
      .from('notifications')
      .select(
        `
        id, type, video_id, message, is_read, created_at, actor_id
      `
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(80)

    if (!data || data.length === 0) {
      setNotifications([])
      setNotifUnread(0)
      setLoadingNotif(false)
      return
    }

    const filtered = data.filter(
      (n) => !blockedSet.has(n.actor_id) && allowed(n.type)
    )

    const actorIds = [...new Set(filtered.map((n) => n.actor_id))]
    const { data: profiles } =
      actorIds.length > 0
        ? await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('id', actorIds)
        : { data: [] as any[] }

    const list: NotifItem[] = filtered.map((n) => ({
      ...n,
      actor: profiles?.find((p) => p.id === n.actor_id) || null,
    }))

    setNotifications(list)
    setNotifUnread(list.filter((n) => !n.is_read).length)

    if (actorIds.length > 0) {
      const { data: myFollows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId)
        .in('following_id', actorIds)
      setFollowedBack(new Set((myFollows || []).map((f) => f.following_id)))
    } else {
      setFollowedBack(new Set())
    }

    setLoadingNotif(false)
  }, [])

  const markAllNotifRead = async () => {
    if (!currentUserId) return
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', currentUserId)
      .eq('is_read', false)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setNotifUnread(0)
  }

  const notifText = (n: NotifItem) => {
    const name = n.actor?.username || n.actor?.full_name || 'seseorang'
    if (n.type === 'like') return `@${name} menyukai videomu`
    if (n.type === 'follow') return `@${name} mulai mengikuti kamu`
    if (n.type === 'follow_request') return `@${name} meminta follow`
    if (n.type === 'comment') return `@${name} mengomentari: ${n.message || ''}`
    if (n.type === 'mention') {
      return n.message
        ? `@${name} menyebut kamu: ${n.message}`
        : `@${name} menyebut kamu`
    }
    if (n.type === 'save') return `@${name} menyimpan videomu`
    if (n.type === 'share') return `@${name} membagikan videomu`
    return n.message || 'Notifikasi baru'
  }

  const deleteChat = async (partnerId: string) => {
    if (!currentUserId) return
    const ok = confirm('Hapus chat ini dari inbox kamu?')
    if (!ok) return

    const { data: msgs } = await supabase
      .from('messages')
      .select('id, deleted_for')
      .or(
        `and(sender_id.eq.${currentUserId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${currentUserId})`
      )

    if (msgs) {
      for (const m of msgs) {
        const prev: string[] = m.deleted_for || []
        if (prev.includes(currentUserId)) continue
        await supabase
          .from('messages')
          .update({ deleted_for: [...prev, currentUserId] })
          .eq('id', m.id)
      }
    }

    setConversations((prev) => prev.filter((c) => c.userId !== partnerId))
    setMenuUserId(null)
  }

  const blockUser = async (partnerId: string) => {
    if (!currentUserId) return
    const ok = confirm('Blokir pengguna ini? Chat juga akan dihapus dari inbox kamu.')
    if (!ok) return

    const { error } = await supabase.from('blocks').insert({
      blocker_id: currentUserId,
      blocked_id: partnerId,
    })

    if (error && !String(error.message).toLowerCase().includes('duplicate')) {
      toast('Gagal blokir: ' + error.message, 'error')
      return
    }

    const { data: msgs } = await supabase
      .from('messages')
      .select('id, deleted_for')
      .or(
        `and(sender_id.eq.${currentUserId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${currentUserId})`
      )

    if (msgs) {
      for (const m of msgs) {
        const prev: string[] = m.deleted_for || []
        if (prev.includes(currentUserId)) continue
        await supabase
          .from('messages')
          .update({ deleted_for: [...prev, currentUserId] })
          .eq('id', m.id)
      }
    }

    setConversations((prev) => prev.filter((c) => c.userId !== partnerId))
    setMenuUserId(null)
  }

  const handleAcceptRequest = async (n: NotifItem, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!currentUserId || actingId) return
    setActingId(n.id)

    const { error: followErr } = await supabase.from('follows').insert({
      follower_id: n.actor_id,
      following_id: currentUserId,
    })
    if (followErr && !String(followErr.message).toLowerCase().includes('duplicate')) {
      toast('Gagal accept: ' + followErr.message, 'error')
      setActingId(null)
      return
    }

    await supabase
      .from('follow_requests')
      .update({ status: 'accepted' })
      .eq('requester_id', n.actor_id)
      .eq('target_id', currentUserId)
      .eq('status', 'pending')

    await supabase
      .from('notifications')
      .update({ is_read: true, type: 'follow' })
      .eq('id', n.id)

    await insertNotification(supabase, {
      user_id: n.actor_id,
      actor_id: currentUserId,
      type: 'follow',
    })

    setNotifications((prev) =>
      prev.map((x) =>
        x.id === n.id ? { ...x, is_read: true, type: 'follow' } : x
      )
    )
    setNotifUnread((c) => Math.max(0, c - 1))
    setActingId(null)
  }

  const handleDeclineRequest = async (n: NotifItem, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!currentUserId || actingId) return
    setActingId(n.id)

    await supabase
      .from('follow_requests')
      .update({ status: 'rejected' })
      .eq('requester_id', n.actor_id)
      .eq('target_id', currentUserId)
      .eq('status', 'pending')

    await supabase.from('notifications').delete().eq('id', n.id)

    setNotifications((prev) => prev.filter((x) => x.id !== n.id))
    setNotifUnread((c) => Math.max(0, c - 1))
    setActingId(null)
  }

  const handleFollowBack = async (n: NotifItem, e: React.MouseEvent) => {
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

    await insertNotification(supabase, {
      user_id: n.actor_id,
      actor_id: currentUserId,
      type: 'follow',
    })

    setFollowedBack((prev) => new Set(prev).add(n.actor_id))
    setActingId(null)
  }
  const openNewChat = async () => {
    if (!currentUserId) return
    setShowNewChat(true)
    setNewChatQuery('')
    setLoadingNewChat(true)

    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', currentUserId)

    const ids = (follows || []).map((f) => f.following_id)
    if (ids.length === 0) {
      setNewChatList([])
      setLoadingNewChat(false)
      return
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', ids)
      .order('username', { ascending: true })
      .limit(80)

    setNewChatList(profiles || [])
    setLoadingNewChat(false)
  }
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

      await loadConversations(user.id)
      await loadNotifications(user.id)
      setLoading(false)
    }

    init()
  }, [])

  useEffect(() => {
    if (!currentUserId) return

    const channel = supabase
      .channel(`inbox-realtime-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        () => {
          loadConversations(currentUserId)
        }
      )
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

    // Backup kalau realtime putus / tab aktif
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadConversations(currentUserId)
        loadNotifications(currentUserId)
      }
    }, 60000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [currentUserId, loadConversations, loadNotifications])

  if (loading) {
    return (
      <div className="h-[100dvh] overflow-y-auto overscroll-y-contain bg-black text-white pb-20">
        <div className="px-4 h-14 flex items-center border-b border-white/10">
          <div className="h-4 w-16 bg-zinc-800 rounded animate-pulse" />
        </div>
        <div className="px-4 pt-4 space-y-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-zinc-800 animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 bg-zinc-800 rounded animate-pulse" />
                <div className="h-3 w-48 bg-zinc-800 rounded animate-pulse" />
              </div>
              <div className="h-3 w-10 bg-zinc-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] overflow-y-auto overscroll-y-contain bg-black text-white pb-20">
      <div className="sticky top-0 z-50 bg-black/95 backdrop-blur-md border-b border-white/10">
        <div className="px-4 h-12 flex items-center justify-between">
          <h1 className="text-base font-semibold">Inbox</h1>
          <div className="flex items-center gap-3">
            {tab === 'activity' && notifUnread > 0 && (
              <button
                onClick={markAllNotifRead}
                className="text-xs text-pink-400 font-medium"
              >
                Tandai dibaca
              </button>
            )}
            {tab === 'messages' && (
              <button
                type="button"
                onClick={() => void openNewChat()}
                className="text-xs font-semibold text-pink-400"
              >
                + Pesan baru
              </button>
            )}
          </div>
        </div>

        <div className="pb-2">
          <StoryBar />
        </div>

        <div className="flex px-4 border-t border-white/10">
          <button
            onClick={() => setTab('messages')}
            className={`flex-1 py-2.5 text-sm font-semibold relative ${
              tab === 'messages' ? 'text-pink-400' : 'text-white/40'
            }`}
          >
            Pesan
            {totalUnread > 0 && (
              <span className="ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-vezao-gradient text-[10px] font-bold text-white inline-flex items-center justify-center align-middle">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
            {tab === 'messages' && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-pink-400 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setTab('activity')}
            className={`flex-1 py-2.5 text-sm font-semibold relative ${
              tab === 'activity' ? 'text-pink-400' : 'text-white/40'
            }`}
          >
            Aktivitas
            {notifUnread > 0 && (
              <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-vezao-gradient align-middle" />
            )}
            {tab === 'activity' && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-pink-400 rounded-full" />
            )}
          </button>
        </div>
      </div>

      {tab === 'activity' ? (
        <div className="divide-y divide-white/5">
          {loadingNotif ? (
            <div className="px-4 pt-4 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-zinc-800 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-40 bg-zinc-800 rounded animate-pulse" />
                    <div className="h-3 w-24 bg-zinc-800 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <p className="text-sm font-medium text-white">Belum ada aktivitas</p>
              <p className="text-xs text-gray-500 mt-1.5">
                Like, follow, dan komentar muncul di sini
              </p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`w-full flex items-center gap-3 px-4 py-3.5 ${
                  !n.is_read ? 'bg-white/[0.04]' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={async () => {
                    if (!n.is_read) {
                      await supabase
                        .from('notifications')
                        .update({ is_read: true })
                        .eq('id', n.id)
                      setNotifications((prev) =>
                        prev.map((x) =>
                          x.id === n.id ? { ...x, is_read: true } : x
                        )
                      )
                      setNotifUnread((c) => Math.max(0, c - 1))
                    }
                    if (n.video_id) router.push(`/v/${n.video_id}`)
                    else if (n.actor?.username)
                      router.push(`/@${n.actor.username}`)
                  }}
                  className="flex flex-1 items-center gap-3 min-w-0 text-left active:opacity-80"
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-800 shrink-0 ring-1 ring-white/10">
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
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm ${
                        !n.is_read ? 'font-semibold text-white' : 'text-gray-300'
                      }`}
                    >
                      {notifText(n)}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {formatInboxTime(n.created_at)}
                    </p>
                  </div>
                  {!n.is_read && n.type !== 'follow' && n.type !== 'follow_request' && (
                    <div className="w-2 h-2 rounded-full bg-vezao-gradient shrink-0" />
                  )}
                </button>

                {n.type === 'follow_request' && (
                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => handleAcceptRequest(n, e)}
                      disabled={actingId === n.id}
                      className="px-3 py-1.5 rounded-full bg-vezao-gradient text-xs font-semibold disabled:opacity-50"
                    >
                      {actingId === n.id ? '...' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeclineRequest(n, e)}
                      disabled={actingId === n.id}
                      className="px-3 py-1.5 rounded-full bg-zinc-800 border border-white/10 text-xs font-semibold disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                )}

                {n.type === 'follow' && (
                  <div className="shrink-0">
                    {followedBack.has(n.actor_id) ? (
                      <span className="px-3 py-1.5 rounded-full bg-zinc-800 border border-white/10 text-xs font-semibold text-gray-300">
                        Following
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => handleFollowBack(n, e)}
                        disabled={actingId === n.id}
                        className="px-3 py-1.5 rounded-full bg-vezao-gradient text-xs font-semibold disabled:opacity-50"
                      >
                        {actingId === n.id ? '...' : 'Follow back'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="divide-y divide-white/5" onClick={() => setMenuUserId(null)}>
          {conversations.length > 0 && (
            <div className="px-4 py-2 border-b border-white/5">
              <input
                value={chatQuery}
                onChange={(e) => setChatQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Cari chat..."
                className="w-full bg-zinc-900 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
            </div>
          )}
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-white">Belum ada pesan</p>
              <p className="text-xs text-gray-500 mt-1.5 max-w-[240px]">
                Mulai chat lewat tombol Message di profil orang
              </p>
            </div>
          ) : (
            conversations
              .filter((c) => {
                const q = chatQuery.trim().toLowerCase()
                if (!q) return true
                return (
                  c.fullName.toLowerCase().includes(q) ||
                  c.username.toLowerCase().includes(q)
                )
              })
              .map((conv) => (
              <div
                key={conv.userId}
                className="relative flex items-center gap-2 px-4 py-3.5 active:bg-white/5"
              >
                <div
                  className="flex flex-1 items-center gap-3 min-w-0 cursor-pointer"
                  onClick={() => router.push(`/inbox/chat?userId=${conv.userId}`)}
                >
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/@${conv.username}`)
                    }}
                    className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden shrink-0 ring-1 ring-white/10"
                  >
                    {conv.avatarUrl ? (
                      <img src={conv.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-lg font-bold bg-vezao-gradient">
                        {conv.username[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p
                        className={`text-sm truncate ${
                          conv.hasUnread ? 'font-bold text-white' : 'font-semibold text-white'
                        }`}
                      >
                        {conv.fullName}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <span
                          className={`text-[11px] ${
                            conv.hasUnread ? 'text-white font-medium' : 'text-gray-500'
                          }`}
                        >
                          {formatInboxTime(conv.lastMessageTime)}
                        </span>
                        {conv.unreadCount > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-vezao-gradient text-[10px] font-bold flex items-center justify-center text-white">
                            {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <p
                      className={`text-sm truncate mt-0.5 ${
                        conv.hasUnread ? 'text-white font-medium' : 'text-gray-400'
                      }`}
                    >
                      {conv.lastMessage}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuUserId(menuUserId === conv.userId ? null : conv.userId)
                  }}
                  className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white/70 shrink-0"
                >
                  ⋯
                </button>

                {menuUserId === conv.userId && (
                  <div
                    className="absolute right-3 top-12 z-30 bg-zinc-900 border border-white/10 rounded-xl py-1 shadow-xl min-w-[160px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        setMenuUserId(null)
                        router.push(`/@${conv.username}`)
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/5"
                    >
                      Lihat profil
                    </button>
                    <button
                      onClick={() => deleteChat(conv.userId)}
                      className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/5"
                    >
                      Hapus chat
                    </button>
                    <button
                      onClick={() => blockUser(conv.userId)}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-white/5"
                    >
                      Blokir
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {showNewChat && (
        <div className="fixed inset-0 z-[80] flex items-end">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowNewChat(false)}
          />
          <div className="relative w-full max-w-[480px] mx-auto bg-zinc-900 rounded-t-2xl max-h-[75vh] flex flex-col pb-6">
            <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mt-3 mb-3" />
            <h3 className="text-center font-semibold mb-3">Pesan baru</h3>
            <div className="px-4 mb-2">
              <input
                value={newChatQuery}
                onChange={(e) => setNewChatQuery(e.target.value)}
                placeholder="Cari yang kamu follow..."
                className="w-full bg-zinc-800 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-2 min-h-[200px]">
              {loadingNewChat ? (
                <p className="text-center text-gray-500 py-10 text-sm">Loading...</p>
              ) : newChatList.length === 0 ? (
                <p className="text-center text-gray-500 py-10 text-sm px-6">
                  Follow seseorang dulu untuk mulai chat
                </p>
              ) : (
                newChatList
                  .filter((u) => {
                    const q = newChatQuery.trim().toLowerCase()
                    if (!q) return true
                    return (
                      (u.username || '').toLowerCase().includes(q) ||
                      (u.full_name || '').toLowerCase().includes(q)
                    )
                  })
                  .map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setShowNewChat(false)
                        router.push(`/inbox/chat?userId=${u.id}`)
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl active:bg-white/5 text-left"
                    >
                      <div className="w-11 h-11 rounded-full overflow-hidden bg-zinc-800 shrink-0 ring-1 ring-white/10">
                        {u.avatar_url ? (
                          <img
                            src={u.avatar_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm font-bold bg-vezao-gradient">
                            {(u.username || 'U')[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {u.full_name || u.username}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          @{u.username}
                        </p>
                      </div>
                    </button>
                  ))
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowNewChat(false)}
              className="mt-2 py-2 text-sm text-gray-400"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}