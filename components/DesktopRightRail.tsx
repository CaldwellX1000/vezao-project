'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Profile = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
}

export default function DesktopRightRail() {
  const [suggested, setSuggested] = useState<Profile[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)

      const followingIds = new Set((follows || []).map((f) => f.following_id))
      followingIds.add(user.id)

      const { data } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .not('id', 'in', `(${[...followingIds].join(',')})`)
        .limit(8)

      // fallback kalau filter rumit gagal
      if (!data?.length) {
        const { data: any } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .neq('id', user.id)
          .limit(8)
        setSuggested((any || []).filter((p) => !followingIds.has(p.id)))
        return
      }
      setSuggested(data)
    }
    load()
  }, [])

  return (
    <aside className="hidden xl:flex fixed right-0 top-0 z-40 h-full w-72 flex-col border-l border-white/10 bg-black/90 p-4 overflow-y-auto scrollbar-hide">
      <p className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-3">
        Suggested
      </p>
      <div className="space-y-2">
        {suggested.length === 0 ? (
          <p className="text-xs text-white/30 py-4">Belum ada saran</p>
        ) : (
          suggested.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => router.push(`/@${p.username || p.id}`)}
              className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left"
            >
              <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 shrink-0">
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-bold bg-vezao-gradient">
                    {(p.username || 'U')[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate text-white">
                  {p.full_name || p.username}
                </p>
                <p className="text-xs text-white/40 truncate">@{p.username}</p>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="mt-8 pt-4 border-t border-white/10">
        <p className="text-[11px] text-white/25 leading-relaxed">
          © {new Date().getFullYear()} SERULO
        </p>
      </div>
    </aside>
  )
}