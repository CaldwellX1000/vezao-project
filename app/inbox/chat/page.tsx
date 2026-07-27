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

  const router = useRouter()
  const supabase = createClient()
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadMessages = async (userId: string, partner: string) => {
    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: true })

    const filtered = (msgs || []).filter(
      (m) =>
        (m.sender_id === userId && m.receiver_id === partner) ||
        (m.sender_id === partner && m.receiver_id === userId)
    )
    setMessages(filtered)
  }

  useEffect(() => {
    const init = async () => {
      if (!partnerId) {
        router.replace('/inbox')
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setCurrentUserId(user.id)

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
            (newMsg.sender_id === currentUserId && newMsg.receiver_id === partnerId) ||
            (newMsg.sender_id === partnerId && newMsg.receiver_id === currentUserId)

          if (isRelevant) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev
              const withoutTemp = prev.filter((m) => !m.id.startsWith('temp-'))
              return [...withoutTemp, newMsg]
            })

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
      .subscribe()

    const interval = setInterval(() => {
      loadMessages(currentUserId, partnerId)
    }, 2000)

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

    const content = newMessage.trim()
    setNewMessage('')
    setSending(true)

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
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? data : m))
      )
    }

    setSending(false)
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
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                    isMe
                      ? 'bg-vezao-gradient text-white rounded-br-md'
                      : 'bg-zinc-800 text-white rounded-bl-md'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 bg-black border-t border-white/10 px-3 py-3 flex items-center gap-2">
        <input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Tulis pesan..."
          className="flex-1 bg-zinc-800 rounded-full px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
        <button
          onClick={sendMessage}
          disabled={!newMessage.trim() || sending}
          className="w-10 h-10 bg-vezao-gradient rounded-full flex items-center justify-center disabled:opacity-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
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