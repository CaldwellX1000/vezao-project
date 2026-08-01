'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { insertNotification } from '@/lib/notify'

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
  views_count?: number | null
  user_id: string
  profiles: {
    username: string | null
    avatar_url: string | null
  } | null
}

type Tab = 'users' | 'videos' | 'hashtags'

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
function extractTags(caption: string | null): string[] {
  if (!caption) return []
  const matches = caption.match(/#[\w]+/g) || []
  return matches.map((t) => t.slice(1).toLowerCase())
}
export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<Profile[]>([])
  const [videos, setVideos] = useState<VideoResult[]>([])
  const [hashtags, setHashtags] = useState<string[]>([])
  const [suggested, setSuggested] = useState<Profile[]>([])
  const [suggestedVideos, setSuggestedVideos] = useState<VideoResult[]>([])
  const [trendingTags, setTrendingTags] = useState<{ tag: string; count: number }[]>([])
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

      // Blokir 2 arah
      const { data: blocks } = await supabase
        .from('blocks')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`)

      const blockedSet = new Set<string>()
      ;(blocks || []).forEach((b) => {
        if (b.blocker_id === user.id) blockedSet.add(b.blocked_id)
        if (b.blocked_id === user.id) blockedSet.add(b.blocker_id)
      })
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

      const list = shuffleArray(
        (profiles || []).filter(
          (p) => !blockedSet.has(p.id) && !followSet.has(p.id)
        )
      ).slice(0, 12)

      setSuggested(list)

      const { data: popular } = await supabase
        .from('videos')
        .select(`
          id,
          caption,
          video_url,
          thumbnail_url,
          likes_count,
          views_count,
          user_id,
          visibility,
          profiles ( username, avatar_url )
        `)
        .eq('is_draft', false)
        .order('views_count', { ascending: false })
        .limit(30)

      const filteredVids = (popular || []).filter((v: any) => {
        if (blockedSet.has(v.user_id)) return false
        const vis = String(v.visibility ?? 'public')
          .toLowerCase()
          .replace(/['"]/g, '')
          .trim()
        return vis !== 'private'
      })
      // tetap dari video ber-views tinggi, tapi urutan diacak
            setSuggestedVideos(shuffleArray(filteredVids).slice(0, 18) as any)

      const { data: recentForTags } = await supabase
        .from('videos')
        .select('caption, visibility')
        .eq('is_draft', false)
        .order('created_at', { ascending: false })
        .limit(150)

      const tagCount: Record<string, number> = {}
      ;(recentForTags || []).forEach((row: any) => {
        const vis = String(row.visibility ?? 'public')
          .toLowerCase()
          .replace(/['"]/g, '')
          .trim()
        if (vis === 'private') return
        extractTags(row.caption).forEach((tag) => {
          tagCount[tag] = (tagCount[tag] || 0) + 1
        })
      })

      setTrendingTags(
        Object.entries(tagCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([tag, count]) => ({ tag, count }))
      )
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
        setUsers(shuffleArray(filtered))
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
            views_count,
            user_id,
            visibility,
            profiles ( username, avatar_url )
          `)
          .eq('is_draft', false)
          .ilike('caption', `%${q}%`)
          .order('views_count', { ascending: false })
          .limit(30)

        const filtered = (data || []).filter((v: any) => {
          if (blockedUsers.has(v.user_id)) return false
          const vis = String(v.visibility ?? 'public')
            .toLowerCase()
            .replace(/['"]/g, '')
            .trim()
          return vis !== 'private'
        })
        setVideos(shuffleArray(filtered) as any)
      }

      if (tab === 'hashtags') {
        const { data } = await supabase
          .from('videos')
          .select('caption, visibility')
          .eq('is_draft', false)
          .ilike('caption', `%#${q}%`)
          .limit(50)

        const publicRows = (data || []).filter((row: any) => {
          const vis = String(row.visibility ?? 'public')
            .toLowerCase()
            .replace(/['"]/g, '')
            .trim()
          return vis !== 'private'
        })

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
      await insertNotification(supabase, {
        user_id: targetId,
        actor_id: currentUserId,
        type: 'follow',
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
      onClick={() => router.push(`/@${user.username || user.id}`)}
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
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-3 px-2">
                <div className="w-12 h-12 rounded-full bg-zinc-800 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 bg-zinc-800 rounded animate-pulse" />
                  <div className="h-3 w-20 bg-zinc-800 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : !searched ? (
          tab === 'users' && suggested.length > 0 ? (
            <div>
              <p className="text-sm font-semibold text-gray-400 mb-2 px-2">
                Suggested accounts
              </p>
              <div className="space-y-1">
                {suggested.map((u) => renderUserRow(u, true))}
              </div>
            </div>
          ) : tab === 'videos' && suggestedVideos.length > 0 ? (
            <div>
              <p className="text-sm font-semibold text-gray-400 mb-2 px-2">
                Popular videos
              </p>
              <div className="grid grid-cols-3 gap-[2px]">
                {suggestedVideos.map((v) => (
                  <div
                    key={v.id}
                    onClick={() => router.push(`/v/${v.id}`)}
                    className="aspect-[9/16] bg-zinc-900 relative overflow-hidden cursor-pointer"
                  >
                    {v.thumbnail_url ? (
                      <img
                        src={v.thumbnail_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
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
                      ▶ {v.views_count || 0}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : tab === 'hashtags' && trendingTags.length > 0 ? (
            <div>
              <p className="text-sm font-semibold text-gray-400 mb-2 px-2">
                Trending
              </p>
              <div className="space-y-1">
                {trendingTags.map((t, i) => (
                  <div
                    key={t.tag}
                    onClick={() => router.push(`/hashtag?tag=${t.tag}`)}
                    className="flex items-center gap-3 py-3 active:bg-white/5 rounded-xl px-2 cursor-pointer"
                  >
                    <span className="text-sm text-gray-500 w-5 text-center shrink-0">
                      {i + 1}
                    </span>
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg font-bold text-purple-400 shrink-0">
                      #
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">#{t.tag}</p>
                      <p className="text-xs text-gray-500">{t.count} video</p>
                    </div>
                  </div>
                ))}
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
            <div className="flex flex-col items-center pt-16 px-6 text-center">
              <p className="text-sm font-medium text-white mb-1">Tidak ditemukan</p>
              <p className="text-xs text-gray-500">Coba username atau nama lain</p>
            </div>
          ) : (
            <div className="space-y-1">
              {users.map((user) => renderUserRow(user, true))}
            </div>
          )
        ) : tab === 'videos' ? (
          videos.length === 0 ? (
            <div className="flex flex-col items-center pt-16 px-6 text-center">
              <p className="text-sm font-medium text-white mb-1">Video tidak ditemukan</p>
              <p className="text-xs text-gray-500">Coba kata di caption lain</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-[2px]">
              {videos.map((v) => (
                <div
                  key={v.id}
                  onClick={() => router.push(`/v/${v.id}`)}
                  className="aspect-[9/16] bg-zinc-900 relative overflow-hidden cursor-pointer"
                >
                  {v.thumbnail_url ? (
                    <img
                      src={v.thumbnail_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
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
                    ▶ {v.views_count || 0}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : hashtags.length === 0 ? (
          <div className="flex flex-col items-center pt-16 px-6 text-center">
            <p className="text-sm font-medium text-white mb-1">Hashtag tidak ditemukan</p>
            <p className="text-xs text-gray-500">Coba tanpa tanda #</p>
          </div>
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

      <BottomNav />
    </div>
  )
}