'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'

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
      <span className="text-[10px] text-purple-400 ml-1 inline-flex tracking-tighter">
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

function ChatContent() {
  const searchParams = useSearchParams()
  const partnerId = searchParams.get('userId')

  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [partnerName, setPartnerName] = useState('')
  const [partnerUsername, setPartnerUsername] = useState('')
  const [partnerAvatar, setPartnerAvatar] = useState<string | null>(null)
  const [videoCache, setVideoCache] = useState<Record<string, SharedVideo | null>>({})
  const [menuMsgId, setMenuMsgId] = useState<string | null>(null)
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()
  const bottomRef = useRef<HTMLDivElement>(null)

  const canEditMessage = (msg: Message) => {
    if (parseVideoId(msg.content)) return false
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
        alert('Tidak bisa chat. Akun ini diblokir.')
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
      loadMessages(currentUserId, partnerId)
    }, 3000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [currentUserId, partnerId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
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
      alert('Tidak bisa kirim pesan. Akun ini diblokir.')
      return
    }

    const content = newMessage.trim()
    setSending(true)

    if (editingMsgId) {
      const target = messages.find((m) => m.id === editingMsgId)
      if (!target || !canEditMessage(target)) {
        alert('Pesan hanya bisa diedit dalam 30 menit setelah dikirim')
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
        alert('Gagal edit pesan. Cek policy UPDATE di tabel messages.')
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
      alert('Gagal mengirim pesan')
    } else if (data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data : m)))
    }

    setSending(false)
  }

  const startEdit = (msg: Message) => {
    if (!canEditMessage(msg)) {
      alert('Pesan hanya bisa diedit dalam 30 menit setelah dikirim')
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
      alert('Gagal hapus: ' + error.message)
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
      alert('Hapus untuk semua hanya untuk pesan kamu sendiri dalam 30 menit')
      setDeleteConfirmId(null)
      return
    }

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', msgId)
      .eq('sender_id', currentUserId)

    if (error) {
      alert('Gagal hapus untuk semua: ' + error.message)
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
      <div className="sticky top-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/10 px-4 h-14 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-white text-lg font-bold">
          ←
        </button>
        <div
          className="flex items-center gap-3 cursor-pointer min-w-0"
          onClick={() => router.push(`/@${partnerUsername || partnerId}`)}
        >
          <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden shrink-0">
            {partnerAvatar ? (
              <img src={partnerAvatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-bold bg-vezao-gradient">
                {partnerName[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <p className="font-semibold text-sm truncate">{partnerName}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm pt-20">
            Belum ada pesan. Mulai percakapan!
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === currentUserId
            const videoId = parseVideoId(msg.content)
            const shared = videoId ? videoCache[videoId] : undefined

            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                {videoId ? (
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
                        } ${editingMsgId === msg.id ? 'ring-1 ring-purple-400' : ''}`}
                      >
                        {msg.content}
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
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 bg-black border-t border-white/10 px-3 py-3">
        {editingMsgId && (
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs text-purple-400">Mengedit pesan</span>
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
        <div className="flex items-center gap-2">
          <input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder={editingMsgId ? 'Edit pesan...' : 'Tulis pesan...'}
            className="flex-1 bg-zinc-800 rounded-full px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending}
            className="w-10 h-10 bg-vezao-gradient rounded-full flex items-center justify-center disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
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