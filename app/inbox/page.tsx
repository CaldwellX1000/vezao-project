'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

type Conversation = {
  userId: string
  username: string
  fullName: string
  avatarUrl: string | null
  lastMessage: string
  lastMessageTime: string
  hasUnread: boolean
}

function formatLastMessage(content: string) {
  if (content.startsWith('__VIDEO__:')) return 'membagikan video'
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

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [totalUnread, setTotalUnread] = useState(0)
  const [menuUserId, setMenuUserId] = useState<string | null>(null)

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

    // Sembunyikan chat dengan akun yang diblokir (2 arah)
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

    // Unread hanya dari yang tidak diblokir
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

      const hasUnread = messages.some(
        (m) =>
          m.sender_id === partnerId &&
          m.receiver_id === userId &&
          m.is_read === false
      )

      if (profile && lastMsg) {
        convList.push({
          userId: partnerId,
          username: profile.username || 'user',
          fullName: profile.full_name || profile.username || 'user',
          avatarUrl: profile.avatar_url,
          lastMessage: formatLastMessage(lastMsg.content),
          lastMessageTime: lastMsg.created_at,
          hasUnread,
        })
      }
    })

    convList.sort(
      (a, b) =>
        new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    )

    setConversations(convList)
  }, [])

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
      alert('Gagal blokir: ' + error.message)
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
      setLoading(false)
    }

    init()
  }, [])

  useEffect(() => {
    if (!currentUserId) return

    const channel = supabase
      .channel('inbox-messages')
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
      .subscribe()

    const interval = setInterval(() => {
      loadConversations(currentUserId)
    }, 3000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [currentUserId, loadConversations])

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white pb-20">
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
    <div className="min-h-screen bg-black text-white pb-20">
      <div className="sticky top-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/10 px-4 h-14 flex items-center">
        <h1 className="text-lg font-bold">Inbox</h1>
      </div>

      {conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center pt-32 text-gray-400">
          <p className="text-sm">Belum ada pesan</p>
          <p className="text-xs mt-1">
            Mulai chat dengan menekan tombol Message di profil orang
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/5" onClick={() => setMenuUserId(null)}>
          {conversations.map((conv) => (
            <div
              key={conv.userId}
              className="relative flex items-center gap-2 px-4 py-3 active:bg-white/5"
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
                  className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden shrink-0"
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
                    <span
                      className={`text-[11px] shrink-0 ml-2 ${
                        conv.hasUnread ? 'text-white font-medium' : 'text-gray-500'
                      }`}
                    >
                      {formatInboxTime(conv.lastMessageTime)}
                    </span>
                  </div>
                  <p
                    className={`text-sm truncate mt-0.5 ${
                      conv.hasUnread ? 'text-white font-medium' : 'text-gray-400'
                    }`}
                  >
                    {formatLastMessage(conv.lastMessage)}
                  </p>
                </div>

                {conv.hasUnread && (
                  <div className="w-2.5 h-2.5 rounded-full bg-vezao-gradient shrink-0" />
                )}
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuUserId(menuUserId === conv.userId ? null : conv.userId)
                }}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white shrink-0"
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
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  )
}