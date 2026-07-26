'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Conversation = {
  userId: string
  username: string
  fullName: string
  avatarUrl: string | null
  lastMessage: string
  lastMessageTime: string
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setCurrentUserId(user.id)

      // Ambil semua pesan yang melibatkan user ini
      const { data: messages } = await supabase
        .from('messages')
        .select('id, sender_id, receiver_id, content, created_at')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false })

      if (!messages || messages.length === 0) {
        setLoading(false)
        return
      }

      // Ambil daftar lawan bicara unik
      const partnerIds = new Set<string>()
      messages.forEach((msg) => {
        const partnerId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id
        partnerIds.add(partnerId)
      })

      // Ambil profil lawan bicara
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', Array.from(partnerIds))

      // Susun daftar percakapan
      const convList: Conversation[] = []

      partnerIds.forEach((partnerId) => {
        const profile = profiles?.find((p) => p.id === partnerId)
        const lastMsg = messages.find(
          (m) =>
            (m.sender_id === user.id && m.receiver_id === partnerId) ||
            (m.sender_id === partnerId && m.receiver_id === user.id)
        )

        if (profile && lastMsg) {
          convList.push({
            userId: partnerId,
            username: profile.username || 'user',
            fullName: profile.full_name || profile.username || 'user',
            avatarUrl: profile.avatar_url,
            lastMessage: lastMsg.content,
            lastMessageTime: lastMsg.created_at,
          })
        }
      })

      // Urutkan berdasarkan pesan terakhir
      convList.sort(
        (a, b) =>
          new Date(b.lastMessageTime).getTime() -
          new Date(a.lastMessageTime).getTime()
      )

      setConversations(convList)
      setLoading(false)
    }

    load()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/10 px-4 h-14 flex items-center">
        <h1 className="text-lg font-bold">Inbox</h1>
      </div>

      {/* Daftar Percakapan */}
      {conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center pt-32 text-gray-400">
          <p className="text-sm">Belum ada pesan</p>
          <p className="text-xs mt-1">Mulai chat dengan menekan tombol Message di profil orang</p>
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {conversations.map((conv) => (
            <div
              key={conv.userId}
              onClick={() => router.push(`/inbox/chat?userId=${conv.userId}`)}
              className="flex items-center gap-3 px-4 py-3 active:bg-white/5 cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden shrink-0">
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
                  <p className="font-semibold text-sm truncate">{conv.fullName}</p>
                  <span className="text-[11px] text-gray-500 shrink-0 ml-2">
                    {new Date(conv.lastMessageTime).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
                <p className="text-sm text-gray-400 truncate mt-0.5">{conv.lastMessage}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/95 border-t border-white/10 h-16 flex items-center justify-around z-50 backdrop-blur-md">
        <button onClick={() => router.push('/')} className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
          </svg>
          <span className="text-[11px] text-gray-400">Home</span>
        </button>

        <button onClick={() => router.push('/inbox')} className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span className="text-[11px] text-white">Inbox</span>
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