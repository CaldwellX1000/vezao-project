'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from '@/lib/toast'

type Message = {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  created_at: string
  is_read?: boolean
  deleted_for?: string[] | null
}

type SharedVideo = {
  id: string
  video_url: string
  thumbnail_url: string | null
  caption: string | null
  profiles: {
    username: string | null
    avatar_url: string | null
  } | null
}

function parseVideoId(content: string): string | null {
  if (content.startsWith('__VIDEO__:')) {
    return content.replace('__VIDEO__:', '').trim() || null
  }
  return null
}

function parseImageUrl(content: string): string | null {
  if (content.startsWith('__IMAGE__:')) {
    return content.replace('__IMAGE__:', '').trim() || null
  }
  return null
}

function parseVideoFileUrl(content: string): string | null {
  if (content.startsWith('__VIDEO_FILE__:')) {
    return content.replace('__VIDEO_FILE__:', '').trim() || null
  }
  return null
}

function parseStoryReply(content: string): { storyId: string; text: string } | null {
  if (!content.startsWith('__STORY__:')) return null
  const lines = content.split('\n')
  const storyId = lines[0].replace('__STORY__:', '').trim()
  const text = lines.slice(1).join('\n').trim()
  if (!storyId) return null
  return { storyId, text }
}

type SharedStory = {
  media_url: string
  media_type: string | null
  expired: boolean
  user_id: string
}

function MessageStatus({
  msgId,
  isRead,
}: {
  msgId: string
  isRead?: boolean
}) {
  if (msgId.startsWith('temp-') || msgId.startsWith('fail-')) {
    return <span className="text-[10px] text-gray-500 ml-1 inline-flex">✓</span>
  }
  if (isRead) {
    return (
      <span className="text-[10px] text-pink-400 ml-1 inline-flex tracking-tighter">
        ✓✓
      </span>
    )
  }
  return (
    <span className="text-[10px] text-gray-500 ml-1 inline-flex tracking-tighter">
      ✓✓
    </span>
  )
}

function formatMsgTime(dateStr: string) {
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
  return (
    d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ' ' + time
  )
}

function formatDayLabel(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round(
    (startToday.getTime() - startMsg.getTime()) / (1000 * 60 * 60 * 24)
  )
  if (diffDays === 0) return 'Hari ini'
  if (diffDays === 1) return 'Kemarin'
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

function isSameDay(a: string, b: string) {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

function ChatContent() {
  const searchParams = useSearchParams()
  const partnerId = searchParams.get('userId')

  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sendingMedia, setSendingMedia] = useState(false)
  const [showStickers, setShowStickers] = useState(false)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [partnerName, setPartnerName] = useState('')
  const [partnerUsername, setPartnerUsername] = useState('')
  const [partnerAvatar, setPartnerAvatar] = useState<string | null>(null)
  const [videoCache, setVideoCache] = useState<Record<string, SharedVideo | null>>({})
  const [storyCache, setStoryCache] = useState<Record<string, SharedStory | null>>({})
  const [menuMsgId, setMenuMsgId] = useState<string | null>(null)
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()
  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)

  const isNearBottom = () => {
    const el = listRef.current
    if (!el) return true
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight
    return gap < 120
  }

  const scrollToBottom = (smooth = true) => {
    bottomRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
    })
  }

  const canEditMessage = (msg: Message) => {
    if (parseVideoId(msg.content)) return false
    if (parseImageUrl(msg.content)) return false
    if (parseVideoFileUrl(msg.content)) return false
    if (parseStoryReply(msg.content)) return false
    const ageMs = Date.now() - new Date(msg.created_at).getTime()
    return ageMs <= 30 * 60 * 1000
  }

  const canDeleteForEveryone = (msg: Message) => {
    if (!currentUserId || msg.sender_id !== currentUserId) return false
    const ageMs = Date.now() - new Date(msg.created_at).getTime()
    return ageMs <= 30 * 60 * 1000
  }

  const checkBlocked = async (uid: string, partner: string) => {
    const { data: a } = await supabase
      .from('blocks')
      .select('id')
      .eq('blocker_id', uid)
      .eq('blocked_id', partner)
      .maybeSingle()

    const { data: b } = await supabase
      .from('blocks')
      .select('id')
      .eq('blocker_id', partner)
      .eq('blocked_id', uid)
      .maybeSingle()

    return !!(a || b)
  }
  const loadSharedStories = async (msgs: Message[]) => {
    const ids = [
      ...new Set(
        msgs
          .map((m) => parseStoryReply(m.content)?.storyId)
          .filter((id): id is string => !!id)
      ),
    ]
    const missing = ids.filter((id) => !(id in storyCache))
    if (missing.length === 0) return

    const { data } = await supabase
      .from('stories')
      .select('id, media_url, media_type, expires_at, user_id')
      .in('id', missing)

    setStoryCache((prev) => {
      const next = { ...prev }
      missing.forEach((id) => {
        next[id] = null
      })
      ;(data || []).forEach((s: any) => {
        next[s.id] = {
          media_url: s.media_url,
          media_type: s.media_type,
          expired: new Date(s.expires_at) <= new Date(),
          user_id: s.user_id,
        }
      })
      return next
    })
  }
  const loadSharedVideos = async (msgs: Message[]) => {
    const ids = [
      ...new Set(
        msgs
          .map((m) => parseVideoId(m.content))
          .filter((id): id is string => !!id)
      ),
    ]
    const missing = ids.filter((id) => !(id in videoCache))
    if (missing.length === 0) return

    const { data } = await supabase
      .from('videos')
      .select(
        `
        id,
        video_url,
        thumbnail_url,
        caption,
        profiles ( username, avatar_url )
      `
      )
      .in('id', missing)

    setVideoCache((prev) => {
      const next = { ...prev }
      missing.forEach((id) => {
        next[id] = null
      })
      ;(data || []).forEach((v: any) => {
        next[v.id] = v
      })
      return next
    })
  }

  const loadMessages = async (userId: string, partner: string) => {
    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: true })

    const filtered = (msgs || []).filter((m) => {
      const inChat =
        (m.sender_id === userId && m.receiver_id === partner) ||
        (m.sender_id === partner && m.receiver_id === userId)
      if (!inChat) return false
      const deletedFor: string[] = m.deleted_for || []
      if (deletedFor.includes(userId)) return false
      return true
    })
    setMessages(filtered)
    await loadSharedVideos(filtered)
    await loadSharedStories(filtered)
  }

  useEffect(() => {
    const init = async () => {
      if (!partnerId) {
        router.replace('/inbox')
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setCurrentUserId(user.id)

      const blocked = await checkBlocked(user.id, partnerId)
      if (blocked) {
        toast('Tidak bisa chat. Akun ini diblokir.', 'error')
        router.replace('/inbox')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, full_name, avatar_url')
        .eq('id', partnerId)
        .single()

      if (profile) {
        setPartnerName(profile.full_name || profile.username || 'user')
        setPartnerUsername(profile.username || '')
        setPartnerAvatar(profile.avatar_url)
      }

      await loadMessages(user.id, partnerId)

      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('sender_id', partnerId)
        .eq('receiver_id', user.id)
        .eq('is_read', false)

      setLoading(false)
    }

    init()
  }, [partnerId])

  useEffect(() => {
    if (!currentUserId || !partnerId) return

    const channel = supabase
      .channel(`chat-${currentUserId}-${partnerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const newMsg = payload.new as Message
          const isRelevant =
            (newMsg.sender_id === currentUserId &&
              newMsg.receiver_id === partnerId) ||
            (newMsg.sender_id === partnerId &&
              newMsg.receiver_id === currentUserId)

          if (isRelevant) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev
              const withoutTemp = prev.filter((m) => !m.id.startsWith('temp-'))
              return [...withoutTemp, newMsg]
            })
            loadSharedVideos([newMsg])
            loadSharedStories([newMsg])

            if (newMsg.sender_id === partnerId) {
              supabase
                .from('messages')
                .update({ is_read: true })
                .eq('id', newMsg.id)
                .then()
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const updated = payload.new as Message
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id ? { ...m, is_read: updated.is_read } : m
            )
          )
        }
      )
      .subscribe()

    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      loadMessages(currentUserId, partnerId)
    }, 20000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [currentUserId, partnerId])

  useEffect(() => {
    if (!stickToBottomRef.current) return
    scrollToBottom(true)
  }, [messages])

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUserId || !partnerId || sending) return

    const blocked = await checkBlocked(currentUserId, partnerId)
    if (blocked) {
      const failId = `fail-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        {
          id: failId,
          sender_id: currentUserId,
          receiver_id: partnerId,
          content: newMessage.trim(),
          created_at: new Date().toISOString(),
          is_read: false,
        },
      ])
      setNewMessage('')
      toast('Tidak bisa kirim pesan. Akun ini diblokir.', 'error')
      return
    }

    const content = newMessage.trim()
    setSending(true)

    if (editingMsgId) {
      const target = messages.find((m) => m.id === editingMsgId)
      if (!target || !canEditMessage(target)) {
        toast('Pesan hanya bisa diedit dalam 30 menit setelah dikirim', 'error')
        setEditingMsgId(null)
        setNewMessage('')
        setSending(false)
        return
      }

      const { data, error } = await supabase
        .from('messages')
        .update({ content })
        .eq('id', editingMsgId)
        .eq('sender_id', currentUserId)
        .select()
        .single()

      if (error || !data) {
        toast('Gagal edit pesan', 'error')
        console.error('Edit error:', error)
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === editingMsgId ? { ...m, content: data.content } : m
          )
        )
        setEditingMsgId(null)
        setNewMessage('')
      }
      setSending(false)
      return
    }

    setNewMessage('')
    const tempId = `temp-${Date.now()}`
    const tempMsg: Message = {
      id: tempId,
      sender_id: currentUserId,
      receiver_id: partnerId,
      content,
      created_at: new Date().toISOString(),
      is_read: false,
    }
    stickToBottomRef.current = true
    setMessages((prev) => [...prev, tempMsg])

    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: currentUserId,
        receiver_id: partnerId,
        content,
        is_read: false,
      })
      .select()
      .single()

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      setNewMessage(content)
      toast('Gagal mengirim pesan', 'error')
    } else if (data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data : m)))
    }

    setSending(false)
  }

  const sendMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !currentUserId || !partnerId) return

    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')

    if (!isImage && !isVideo) {
      toast('Hanya gambar atau video', 'error')
      return
    }

    if (isImage && file.size > 8 * 1024 * 1024) {
      toast('Gambar maksimal 8MB', 'error')
      return
    }
    if (isVideo && file.size > 30 * 1024 * 1024) {
      toast('Video maksimal 30MB', 'error')
      return
    }

    const blocked = await checkBlocked(currentUserId, partnerId)
    if (blocked) {
      toast('Tidak bisa kirim. Akun ini diblokir.', 'error')
      return
    }

    setSendingMedia(true)
    try {
      const ext = file.name.split('.').pop() || (isImage ? 'jpg' : 'mp4')
      const path = `${currentUserId}/${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('chat-media')
        .upload(path, file, { contentType: file.type })

      if (upErr) throw upErr

      const {
        data: { publicUrl },
      } = supabase.storage.from('chat-media').getPublicUrl(path)

      const content = isImage
        ? `__IMAGE__:${publicUrl}`
        : `__VIDEO_FILE__:${publicUrl}`

      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: currentUserId,
          receiver_id: partnerId,
          content,
          is_read: false,
        })
        .select('*')
        .single()

      if (error) throw error

      if (data) {
        stickToBottomRef.current = true
        setMessages((prev) => [...prev, data])
      }
    } catch (err: any) {
      toast(err.message || 'Gagal kirim media', 'error')
    } finally {
      setSendingMedia(false)
    }
  }

  const startEdit = (msg: Message) => {
    if (!canEditMessage(msg)) {
      toast('Pesan hanya bisa diedit dalam 30 menit setelah dikirim', 'error')
      setMenuMsgId(null)
      return
    }
    setEditingMsgId(msg.id)
    setNewMessage(msg.content)
    setMenuMsgId(null)
  }

  const deleteForMe = async (msgId: string) => {
    if (!currentUserId) return

    const msg = messages.find((m) => m.id === msgId)
    const prevDeleted: string[] = msg?.deleted_for || []
    const nextDeleted = prevDeleted.includes(currentUserId)
      ? prevDeleted
      : [...prevDeleted, currentUserId]

    const { error } = await supabase
      .from('messages')
      .update({ deleted_for: nextDeleted })
      .eq('id', msgId)

    if (error) {
      toast('Gagal hapus: ' + error.message, 'error')
      console.error(error)
      return
    }

    setMessages((prev) => prev.filter((m) => m.id !== msgId))
    setMenuMsgId(null)
    setDeleteConfirmId(null)
    if (editingMsgId === msgId) {
      setEditingMsgId(null)
      setNewMessage('')
    }
  }

  const deleteForEveryone = async (msgId: string) => {
    if (!currentUserId) return

    const msg = messages.find((m) => m.id === msgId)
    if (!msg || !canDeleteForEveryone(msg)) {
      toast('Hapus untuk semua hanya untuk pesan kamu dalam 30 menit', 'error')
      setDeleteConfirmId(null)
      return
    }

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', msgId)
      .eq('sender_id', currentUserId)

    if (error) {
      toast('Gagal hapus untuk semua: ' + error.message, 'error')
      console.error(error)
      return
    }

    setMessages((prev) => prev.filter((m) => m.id !== msgId))
    setMenuMsgId(null)
    setDeleteConfirmId(null)
    if (editingMsgId === msgId) {
      setEditingMsgId(null)
      setNewMessage('')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="sticky top-0 z-50 bg-black/95 backdrop-blur-md border-b border-white/10 px-4 h-14 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-white/70 text-lg font-bold">
          ←
        </button>
        <div
          className="flex items-center gap-3 cursor-pointer min-w-0 flex-1"
          onClick={() => router.push(`/@${partnerUsername || partnerId}`)}
        >
          <div className="w-9 h-9 rounded-full bg-zinc-800 overflow-hidden shrink-0 ring-1 ring-white/10">
            {partnerAvatar ? (
              <img src={partnerAvatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-bold bg-vezao-gradient">
                {partnerName[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate leading-tight">{partnerName}</p>
            {partnerUsername ? (
              <p className="text-[11px] text-gray-400 truncate leading-tight mt-0.5">
                @{partnerUsername}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div
        ref={listRef}
        onScroll={() => {
          stickToBottomRef.current = isNearBottom()
        }}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center pt-20 px-6 text-center">
            <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-white">Belum ada pesan</p>
            <p className="text-xs text-gray-500 mt-1">Mulai percakapan sekarang</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const prev = index > 0 ? messages[index - 1] : null
            const showDay = !prev || !isSameDay(prev.created_at, msg.created_at)
            const isMe = msg.sender_id === currentUserId
            const videoId = parseVideoId(msg.content)
            const shared = videoId ? videoCache[videoId] : undefined
            const storyReply = parseStoryReply(msg.content)
            const storyMeta = storyReply
              ? storyCache[storyReply.storyId]
              : undefined

            return (
              <div key={msg.id}>
                {showDay && (
                  <div className="flex justify-center my-3">
                    <span className="text-[11px] text-gray-400 bg-zinc-900/90 border border-white/10 px-3 py-1 rounded-full">
                      {formatDayLabel(msg.created_at)}
                    </span>
                  </div>
                )}
              <div
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                {storyReply ? (
                  <div
                    className={`max-w-[75%] flex flex-col gap-1 relative ${
                      isMe ? 'items-end' : 'items-start'
                    }`}
                  >
                    <p
                      className={`text-[10px] text-gray-500 px-1 flex items-center gap-0.5 ${
                        isMe ? 'text-right justify-end' : 'text-left'
                      }`}
                    >
                      {formatMsgTime(msg.created_at)}
                      {isMe && (
                        <MessageStatus msgId={msg.id} isRead={msg.is_read} />
                      )}
                    </p>
                    <div className="relative">
                      {isMe && (
                        <button
                          type="button"
                          onClick={() =>
                            setMenuMsgId(menuMsgId === msg.id ? null : msg.id)
                          }
                          className="absolute -top-1 -right-1 z-10 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white/80 text-[10px]"
                        >
                          ⋯
                        </button>
                      )}
                      <div
                        className={`rounded-2xl overflow-hidden border border-white/10 ${
                          isMe ? 'bg-vezao-gradient/20' : 'bg-zinc-800'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (storyMeta && !storyMeta.expired) {
                              router.push(
                                `/story/view?userId=${storyMeta.user_id}&from=inbox`
                              )
                            }
                          }}
                          className="flex items-center gap-2.5 p-2 text-left w-full min-w-[200px]"
                        >
                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-900 shrink-0">
                            {!storyMeta || storyMeta.expired ? (
                              <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-500 text-center px-1">
                                Berakhir
                              </div>
                            ) : storyMeta.media_type?.startsWith('video') ? (
                              <video
                                src={storyMeta.media_url}
                                className="w-full h-full object-cover"
                                muted
                                playsInline
                              />
                            ) : (
                              <img
                                src={storyMeta.media_url}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] text-gray-400">
                              Balasan story
                            </p>
                            {storyReply.text && (
                              <p className="text-sm text-white line-clamp-2">
                                {storyReply.text}
                              </p>
                            )}
                          </div>
                        </button>
                      </div>
                      {menuMsgId === msg.id && isMe && (
                        <div className="absolute right-0 top-full mt-1 z-20 bg-zinc-800 border border-white/10 rounded-xl py-1 shadow-xl min-w-[140px]">
                          <button
                            onClick={() => {
                              setDeleteConfirmId(msg.id)
                              setMenuMsgId(null)
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/5"
                          >
                            Hapus
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : videoId ? (
                  <div
                    className={`max-w-[70%] flex flex-col gap-1 relative ${
                      isMe ? 'items-end' : 'items-start'
                    }`}
                  >
                    <p
                      className={`text-[10px] text-gray-500 px-1 flex items-center gap-0.5 ${
                        isMe ? 'text-right justify-end' : 'text-left'
                      }`}
                    >
                      {formatMsgTime(msg.created_at)}
                      {isMe && (
                        <MessageStatus msgId={msg.id} isRead={msg.is_read} />
                      )}
                    </p>
                    <div className="relative">
                      {isMe && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuMsgId(menuMsgId === msg.id ? null : msg.id)
                          }}
                          className="absolute -top-1 -right-1 z-10 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white/80 text-xs"
                        >
                          ⋯
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => router.push(`/v/${videoId}`)}
                        className="rounded-2xl overflow-hidden text-left border border-white/10 bg-zinc-900 shadow-lg w-[200px]"
                      >
                        <div className="relative w-full aspect-[9/16] bg-zinc-800">
                          {shared?.thumbnail_url ? (
                            <img
                              src={shared.thumbnail_url}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : shared?.video_url ? (
                            <video
                              src={`${shared.video_url}#t=0.1`}
                              className="absolute inset-0 w-full h-full object-cover"
                              muted
                              playsInline
                              preload="metadata"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
                              Video
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-md">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-6 h-6 text-black ml-0.5"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 p-2.5">
                            <p className="text-white text-xs font-semibold drop-shadow truncate">
                              @{shared?.profiles?.username || 'user'}
                            </p>
                            {shared?.caption && (
                              <p className="text-white/80 text-[10px] line-clamp-2 mt-0.5 drop-shadow">
                                {shared.caption}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                      {menuMsgId === msg.id && isMe && (
                        <div className="absolute right-0 top-8 z-20 bg-zinc-800 border border-white/10 rounded-xl py-1 shadow-xl min-w-[140px]">
                          <button
                            onClick={() => {
                              setDeleteConfirmId(msg.id)
                              setMenuMsgId(null)
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/5"
                          >
                            Hapus
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`max-w-[75%] flex flex-col gap-0.5 relative ${
                      isMe ? 'items-end' : 'items-start'
                    }`}
                  >
                    <p
                      className={`text-[10px] text-gray-500 px-1 flex items-center gap-0.5 ${
                        isMe ? 'text-right justify-end' : 'text-left'
                      }`}
                    >
                      {formatMsgTime(msg.created_at)}
                      {isMe && (
                        <MessageStatus msgId={msg.id} isRead={msg.is_read} />
                      )}
                    </p>
                    <div className="relative">
                      {isMe && (
                        <button
                          type="button"
                          onClick={() =>
                            setMenuMsgId(menuMsgId === msg.id ? null : msg.id)
                          }
                          className="absolute -top-1 -right-1 z-10 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white/80 text-[10px]"
                        >
                          ⋯
                        </button>
                      )}
                      <div
                        className={`px-4 py-2.5 rounded-2xl text-sm ${
                          isMe
                            ? 'bg-vezao-gradient text-white rounded-br-md'
                            : 'bg-zinc-800 text-white rounded-bl-md'
                        } ${editingMsgId === msg.id ? 'ring-1 ring-pink-400' : ''}`}
                      >
                        {(() => {
  const imageUrl = parseImageUrl(msg.content)
  const videoFileUrl = parseVideoFileUrl(msg.content)

  if (imageUrl) {
    return (
      <a href={imageUrl} target="_blank" rel="noreferrer" className="block">
        <img
          src={imageUrl}
          alt="gambar"
          className="max-w-[220px] max-h-[280px] rounded-xl object-cover"
        />
      </a>
    )
  }

  if (videoFileUrl) {
    return (
      <video
        src={videoFileUrl}
        controls
        playsInline
        className="max-w-[240px] max-h-[320px] rounded-xl bg-black"
      />
    )
  }

  // Stiker besar
  const isSticker = msg.content.length <= 4 && /\p{Emoji}/u.test(msg.content)
  if (isSticker) {
    return <span className="text-5xl leading-none">{msg.content}</span>
  }

  return <span>{msg.content}</span>
})()}
                      </div>
                      {menuMsgId === msg.id && isMe && (
                        <div className="absolute right-0 top-full mt-1 z-20 bg-zinc-800 border border-white/10 rounded-xl py-1 shadow-xl min-w-[140px]">
                          {canEditMessage(msg) && (
                            <button
                              onClick={() => startEdit(msg)}
                              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/5"
                            >
                              Edit
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setDeleteConfirmId(msg.id)
                              setMenuMsgId(null)
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/5"
                          >
                            Hapus
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 bg-black/95 border-t border-white/10 px-3 py-3">
        {editingMsgId && (
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs text-pink-400">Mengedit pesan</span>
            <button
              type="button"
              onClick={() => {
                setEditingMsgId(null)
                setNewMessage('')
              }}
              className="text-xs text-gray-400"
            >
              Batal
            </button>
          </div>
        )}
        {showStickers && (
          <div className="mb-2 p-2 bg-zinc-900 rounded-2xl border border-white/10 max-h-48 overflow-y-auto">
            <div className="grid grid-cols-8 gap-1">
              {[
                '😂','🤣','😭','😍','🥰','😎','🔥','💀',
                '👍','👎','❤️','💔','✨','🎉','👏','🙏',
                '😡','🤬','🥺','😴','🤮','🤯','😈','👻',
                '🍕','🍔','☕','🍺','🏀','⚽','🎮','📱',
                '💯','🚀','👀','💪','🤝','🫡','🫣','🫠',
              ].map((sticker) => (
                <button
                  key={sticker}
                  type="button"
                  onClick={() => {
                    setNewMessage(sticker)
                    setShowStickers(false)
                    setTimeout(() => {
                      const btn = document.querySelector('[data-send-btn]') as HTMLButtonElement
                      btn?.click()
                    }, 30)
                  }}
                  className="text-2xl p-1.5 rounded-lg hover:bg-white/10 active:scale-90 transition"
                >
                  {sticker}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={sendMedia}
          />

          {!editingMsgId && (
            <>
              <button
                type="button"
                onClick={() => mediaInputRef.current?.click()}
                disabled={sendingMedia || sending}
                className="w-10 h-10 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center shrink-0 disabled:opacity-50"
                title="Kirim foto/video"
              >
                {sendingMedia ? (
                  <span className="text-xs text-gray-400">...</span>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowStickers((v) => !v)}
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  showStickers ? 'bg-vezao-gradient' : 'bg-zinc-900 border border-white/10'
                }`}
                title="Stiker"
              >
                <span className="text-lg">😊</span>
              </button>
            </>
          )}

          <input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder={editingMsgId ? 'Edit pesan...' : 'Tulis pesan...'}
            className="flex-1 bg-zinc-900 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-pink-400/60"
          />

          <button
            data-send-btn
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending}
            className="w-10 h-10 bg-vezao-gradient rounded-full flex items-center justify-center disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>

        {deleteConfirmId && (
          <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setDeleteConfirmId(null)}
            />
            <div className="relative w-full max-w-sm mx-4 mb-6 sm:mb-0 bg-zinc-900 rounded-2xl p-4 border border-white/10">
              <h3 className="text-center font-semibold mb-1">Hapus pesan?</h3>
              <p className="text-center text-xs text-gray-400 mb-4">
                Pilih cara menghapus pesan ini
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => deleteForMe(deleteConfirmId)}
                  className="w-full py-3 rounded-xl bg-zinc-800 text-sm font-medium hover:bg-zinc-700"
                >
                  Hapus untuk saya
                </button>
                {(() => {
                  const m = messages.find((x) => x.id === deleteConfirmId)
                  if (m && canDeleteForEveryone(m)) {
                    return (
                      <button
                        onClick={() => deleteForEveryone(deleteConfirmId)}
                        className="w-full py-3 rounded-xl bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30"
                      >
                        Hapus untuk semua
                      </button>
                    )
                  }
                  return null
                })()}
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="w-full py-3 text-sm text-gray-400"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  )
}