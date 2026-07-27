'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Profile = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  bio: string | null
}

type VideoResult = {
  id: string
  caption: string | null
  video_url: string
  thumbnail_url: string | null
  likes_count: number
  user_id: string
  profiles: {
    username: string | null
    avatar_url: string | null
  } | null
}

type Tab = 'users' | 'videos' | 'hashtags'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<Profile[]>([])
  const [videos, setVideos] = useState<VideoResult[]>([])
  const [hashtags, setHashtags] = useState<string[]>([])
  const [suggested, setSuggested] = useState<Profile[]>([])
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set())
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setCurrentUserId(user.id)

      const { data: blocks } = await supabase
        .from('blocks')
        .select('blocked_id')
        .eq('blocker_id', user.id)

      const blockedSet = new Set(blocks?.map((b) => b.blocked_id) || [])
      setBlockedUsers(blockedSet)

      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)

      const followSet = new Set(follows?.map((f) => f.following_id) || [])
      setFollowingIds(followSet)

      // Suggested: ambil profil, exclude self / block / sudah follow
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, bio')
        .neq('id', user.id)
        .limit(40)

      const list = (profiles || [])
        .filter((p) => !blockedSet.has(p.id) && !followSet.has(p.id))
        .slice(0, 12)

      setSuggested(list)
    }
    checkAuth()
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setUsers([])
      setVideos([])
      setHashtags([])
      setSearched(false)
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      setSearched(true)
      const q = query.trim().toLowerCase().replace(/^#/, '')

      if (tab === 'users') {
        const { data } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, bio')
          .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
          .limit(30)

        const filtered = (data || []).filter(
          (u) => u.id !== currentUserId && !blockedUsers.has(u.id)
        )
        setUsers(filtered)
      }

      if (tab === 'videos') {
        const { data } = await supabase
          .from('videos')
          .select(`
            id,
            caption,
            video_url,
            thumbnail_url,
            likes_count,
            user_id,
            profiles ( username, avatar_url )
          `)
          .eq('is_draft', false)
          .ilike('caption', `%${q}%`)
          .order('likes_count', { ascending: false })
          .limit(30)

        const filtered = (data || []).filter(
          (v: any) => !blockedUsers.has(v.user_id)
        )
        setVideos(filtered as any)
      }

      if (tab === 'hashtags') {
        const { data } = await supabase
          .from('videos')
          .select('caption')
          .eq('is_draft', false)
          .ilike('caption', `%#${q}%`)
          .limit(50)

        const tagSet = new Set<string>()
        ;(data || []).forEach((row) => {
          const matches: string[] = (row.caption || '').match(/#\w+/g) || []
          matches.forEach((tag) => {
            const clean = tag.slice(1).toLowerCase()
            if (clean.includes(q)) tagSet.add(clean)
          })
        })
        setHashtags(Array.from(tagSet).slice(0, 20))
      }

      setLoading(false)
    }, 400)

    return () => clearTimeout(timer)
  }, [query, tab, blockedUsers, currentUserId])

  const quickFollow = async (targetId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!currentUserId || followingIds.has(targetId)) return

    const { error } = await supabase.from('follows').insert({
      follower_id: currentUserId,
      following_id: targetId,
    })

    if (!error) {
      setFollowingIds((prev) => new Set(prev).add(targetId))
      setSuggested((prev) => prev.filter((p) => p.id !== targetId))
      await supabase.from('notifications').insert({
        user_id: targetId,
        actor_id: currentUserId,
        type: 'follow',
        video_id: null,
        message: null,
        is_read: false,
      })
    }
  }

  const placeholder =
    tab === 'users'
      ? 'Cari username atau nama...'
      : tab === 'videos'
      ? 'Cari video / caption...'
      : 'Cari hashtag...'

  const renderUserRow = (user: Profile, showFollow = false) => (
    <div
      key={user.id}
      onClick={() => router.push(`/user-profile?userId=${user.id}`)}
      className="flex items-center gap-3 py-3 active:bg-white/5 rounded-xl px-2 cursor-pointer"
    >
      <div className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden shrink-0">
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lg font-bold bg-vezao-gradient">
            {(user.username || user.full_name || 'U')[0]?.toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">
          {user.full_name || user.username || 'user'}
        </p>
        <p className="text-sm text-gray-400 truncate">@{user.username || 'user'}</p>
        {user.bio && (
          <p className="text-xs text-gray-500 truncate mt-0.5">{user.bio}</p>
        )}
      </div>
      {showFollow && !followingIds.has(user.id) && (
        <button
          onClick={(e) => quickFollow(user.id, e)}
          className="shrink-0 px-4 py-1.5 rounded-full bg-vezao-gradient text-xs font-semibold"
        >
          Follow
        </button>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      <div className="sticky top-0 z-50 bg-black/95 backdrop-blur-md border-b border-white/10 px-4 pt-3 pb-0">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => router.back()} className="text-white text-lg font-bold shrink-0">
            ←
          </button>
          <div className="flex-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              autoFocus
              className="w-full bg-zinc-800 rounded-full px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>
        </div>

        <div className="flex gap-1">
          {(['users', 'videos', 'hashtags'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-semibold relative ${
                tab === t ? 'text-white' : 'text-gray-500'
              }`}
            >
              {t === 'users' ? 'Users' : t === 'videos' ? 'Videos' : 'Hashtags'}
              {tab === t && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-white rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : !searched ? (
          tab === 'users' && suggested.length > 0 ? (
            <div>
              <p className="text-sm font-semibold text-gray-400 mb-2 px-2">Suggested accounts</p>
              <div className="space-y-1">
                {suggested.map((u) => renderUserRow(u, true))}
              </div>
            </div>
          ) : (
            <p className="text-center text-gray-500 text-sm pt-16">
              {tab === 'users' && 'Cari username atau nama pengguna'}
              {tab === 'videos' && 'Cari berdasarkan caption video'}
              {tab === 'hashtags' && 'Cari hashtag, contoh: dance'}
            </p>
          )
        ) : tab === 'users' ? (
          users.length === 0 ? (
            <p className="text-center text-gray-500 text-sm pt-16">Tidak ditemukan</p>
          ) : (
            <div className="space-y-1">
              {users.map((user) => renderUserRow(user, true))}
            </div>
          )
        ) : tab === 'videos' ? (
          videos.length === 0 ? (
            <p className="text-center text-gray-500 text-sm pt-16">Tidak ditemukan</p>
          ) : (
            <div className="grid grid-cols-3 gap-[2px]">
              {videos.map((v) => (
                <div
                  key={v.id}
                  onClick={() => router.push(`/v/${v.id}`)}
                  className="aspect-[9/16] bg-zinc-900 relative overflow-hidden cursor-pointer"
                >
                  {v.thumbnail_url ? (
                    <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <video
                      src={v.video_url}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  )}
                  <div className="absolute bottom-1 left-1 text-[10px] text-white font-medium drop-shadow">
                    ♥ {v.likes_count}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : hashtags.length === 0 ? (
          <p className="text-center text-gray-500 text-sm pt-16">Tidak ditemukan</p>
        ) : (
          <div className="space-y-1">
            {hashtags.map((tag) => (
              <div
                key={tag}
                onClick={() => router.push(`/hashtag?tag=${tag}`)}
                className="flex items-center gap-3 py-3 active:bg-white/5 rounded-xl px-2 cursor-pointer"
              >
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg font-bold text-purple-400 shrink-0">
                  #
                </div>
                <div>
                  <p className="font-semibold text-sm">#{tag}</p>
                  <p className="text-xs text-gray-500">Lihat video</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-black/95 border-t border-white/10 h-16 flex items-center justify-around z-50 backdrop-blur-md">
        <button onClick={() => router.push('/')} className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
          </svg>
          <span className="text-[11px] text-gray-400">Home</span>
        </button>

        <button onClick={() => router.push('/search')} className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="text-[11px] text-white">Search</span>
        </button>

        <button onClick={() => router.push('/upload')} className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-[11px] text-gray-400">Upload</span>
        </button>

        <button onClick={() => router.push('/inbox')} className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span className="text-[11px] text-gray-400">Inbox</span>
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