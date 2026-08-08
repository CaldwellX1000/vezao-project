'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const LINKS = [
  { href: '/', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z' },
  { href: '/search', label: 'Search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { href: '/upload', label: 'Upload', icon: 'M12 4v16m8-8H4' },
  { href: '/inbox', label: 'Inbox', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
  { href: '/profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
]

type Profile = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
}

export default function DesktopSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [suggested, setSuggested] = useState<Profile[]>([])

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

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
        .neq('id', user.id)
        .limit(20)

      const list = (data || []).filter((p) => !followingIds.has(p.id)).slice(0, 5)
      setSuggested(list)
    }
    load()
  }, [])

  return (
    <aside className="hidden md:flex fixed left-0 top-0 z-50 h-full w-[72px] lg:w-56 flex-col border-r border-white/10 bg-black/95 py-6 px-2 lg:px-3">
      <Link href="/" className="mb-8 flex items-center justify-center lg:justify-start lg:px-3 gap-2">
        <img src="/fav.png" alt="SERULO" className="w-9 h-9 rounded-xl object-cover" />
        <span className="hidden lg:inline font-bold text-sm tracking-wide">SERULO</span>
      </Link>

      <nav className="flex flex-col gap-1">
        {LINKS.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 transition ${
                active ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`w-6 h-6 shrink-0 ${active ? 'text-white' : 'text-white/45'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              <span
                className={`hidden lg:inline text-sm ${
                  active ? 'text-pink-400 font-semibold' : 'text-white/50'
                }`}
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Suggested — hanya tampil saat sidebar lebar */}
      <div className="hidden lg:flex flex-col flex-1 mt-6 pt-4 border-t border-white/10 min-h-0">
        <p className="px-3 text-[11px] font-semibold text-white/40 uppercase tracking-wide mb-2">
          Suggested
        </p>
        <div className="flex-1 overflow-y-auto scrollbar-hide space-y-1">
          {suggested.length === 0 ? (
            <p className="px-3 text-xs text-white/25 py-2">Belum ada saran</p>
          ) : (
            suggested.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => router.push(`/@${p.username || p.id}`)}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-white/5 text-left"
              >
                <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800 shrink-0">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[11px] font-bold bg-vezao-gradient">
                      {(p.username || 'U')[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">
                    {p.full_name || p.username}
                  </p>
                  <p className="text-[11px] text-white/40 truncate">@{p.username}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </aside>
  )
}