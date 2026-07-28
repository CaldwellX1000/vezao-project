'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

type BlockedUser = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
}

export default function BlockedPage() {
  const [list, setList] = useState<BlockedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()

  const load = async (uid: string) => {
    const { data: blocks } = await supabase
      .from('blocks')
      .select('blocked_id')
      .eq('blocker_id', uid)

    if (!blocks || blocks.length === 0) {
      setList([])
      return
    }

    const ids = blocks.map((b) => b.blocked_id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', ids)

    setList(profiles || [])
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
      setUserId(user.id)
      await load(user.id)
      setLoading(false)
    }
    init()
  }, [])

  const unblock = async (blockedId: string) => {
    if (!userId) return
    const ok = confirm('Buka blokir pengguna ini?')
    if (!ok) return

    setActingId(blockedId)
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', userId)
      .eq('blocked_id', blockedId)

    setActingId(null)

    if (error) {
      alert('Gagal buka blokir: ' + error.message)
      return
    }

    setList((prev) => prev.filter((u) => u.id !== blockedId))
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
        <h1 className="text-lg font-bold">Akun diblokir</h1>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center pt-32 text-gray-400">
          <p className="text-sm">Belum ada akun yang diblokir</p>
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {list.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3">
              <div
                className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden shrink-0 cursor-pointer"
                onClick={() => router.push(`/@${u.username || u.id}`)}
              >
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-lg font-bold bg-vezao-gradient">
                    {(u.username || 'U')[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{u.full_name || u.username}</p>
                <p className="text-xs text-gray-400 truncate">@{u.username || 'user'}</p>
              </div>
              <button
                onClick={() => unblock(u.id)}
                disabled={actingId === u.id}
                className="px-3 py-1.5 rounded-full border border-white/20 text-xs font-medium disabled:opacity-50"
              >
                {actingId === u.id ? '...' : 'Buka blokir'}
              </button>
            </div>
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  )
}