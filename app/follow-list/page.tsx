'use client'

import { Suspense, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'

type Profile = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
}

function FollowListContent() {
  const searchParams = useSearchParams()
  const targetUserId = searchParams.get('userId')
  const type = searchParams.get('type') // 'following' | 'followers'

  const [list, setList] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      if (!targetUserId || !type) {
        router.back()
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      setTitle(type === 'following' ? 'Following' : 'Followers')

      if (type === 'following') {
        const { data: follows } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', targetUserId)

        if (follows && follows.length > 0) {
          const ids = follows.map((f) => f.following_id)
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('id', ids)

          setList(profiles || [])
        }
      } else {
        const { data: follows } = await supabase
          .from('follows')
          .select('follower_id')
          .eq('following_id', targetUserId)

        if (follows && follows.length > 0) {
          const ids = follows.map((f) => f.follower_id)
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('id', ids)

          setList(profiles || [])
        }
      }

      setLoading(false)
    }

    load()
  }, [targetUserId, type])

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/10 px-4 h-14 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-white text-lg font-bold">
          ←
        </button>
        <h1 className="text-lg font-bold">{title}</h1>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center pt-32 text-gray-400">
          <p className="text-sm">Belum ada {title.toLowerCase()}</p>
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {list.map((user) => (
            <div
              key={user.id}
              onClick={() => router.push(`/@${user.username || user.id}`)}
              className="flex items-center gap-3 px-4 py-3 active:bg-white/5 cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-lg font-bold bg-vezao-gradient">
                    {(user.username || 'U')[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">
                  {user.full_name || user.username || 'User'}
                </p>
                <p className="text-sm text-gray-400 truncate">
                  @{user.username || 'user'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FollowListPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <FollowListContent />
    </Suspense>
  )
}