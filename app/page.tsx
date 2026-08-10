'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { insertNotification } from '@/lib/notify'
import { toast } from '@/lib/toast'


type Video = {
  id: string
  caption: string | null
  comments_enabled?: boolean | null
  video_url: string
  thumbnail_url?: string | null
  likes_count: number
  comments_count: number
  views_count?: number | null
  saves_count?: number | null
  shares_count?: number | null
  sound_name?: string | null
  created_at: string
  user_id: string
  profiles: {
    username: string | null
    full_name: string | null
    avatar_url: string | null
  } | null
}

type Comment = {
  id: string
  content: string
  created_at: string
  user_id: string
  parent_id?: string | null
  likes_count?: number | null
  profiles: {
    username: string | null
    avatar_url: string | null
  } | null
}

function formatDateTime(dateStr: string) {
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
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  if (isYesterday) return `Kemarin ${time}`
  return (
    d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    }) +
    ' · ' +
    time
  )
}

function canEditComment(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() <= 30 * 60 * 1000
}

function renderTextWithMentions(
  text: string,
  onMention: (username: string) => void,
  onHashtag?: (tag: string) => void
) {
  if (!text) return null
  const parts = text.split(/(@[a-zA-Z0-9._]+|#[\w]+)/g)
  return parts.map((part, i) => {
    if (part.startsWith('@') && part.length > 1) {
      const uname = part.slice(1)
      return (
        <span
          key={i}
          onClick={(e) => {
            e.stopPropagation()
            onMention(uname)
          }}
          className="text-blue-400 font-medium cursor-pointer"
        >
          {part}
        </span>
      )
    }
    if (part.startsWith('#') && onHashtag) {
      return (
        <span
          key={i}
          onClick={(e) => {
            e.stopPropagation()
            onHashtag(part.slice(1))
          }}
          className="text-blue-400 font-medium cursor-pointer"
        >
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

function extractMentions(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9._]+)/g) || []
  return [...new Set(matches.map((m) => m.slice(1)))]
}

async function notifyMentions(
  supabase: ReturnType<typeof createClient>,
  opts: {
    text: string
    actorId: string
    videoId: string | null
    excludeUserIds?: string[]
  }
) {
  const usernames = extractMentions(opts.text)
  if (usernames.length === 0) return

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('username', usernames)

  if (!profiles?.length) return

  const exclude = new Set(opts.excludeUserIds || [])
  exclude.add(opts.actorId)

  const rows = profiles
    .filter((p) => p.id && !exclude.has(p.id))
    .map((p) => ({
      user_id: p.id,
      actor_id: opts.actorId,
      type: 'mention',
      video_id: opts.videoId,
      message: opts.text.slice(0, 120),
      is_read: false,
    }))

  if (rows.length === 0) return
  for (const row of rows) {
    await insertNotification(supabase, {
      user_id: row.user_id,
      actor_id: row.actor_id,
      type: row.type,
      video_id: row.video_id,
      message: row.message,
    })
  }
}

export default function FeedPage() {
  const [allVideos, setAllVideos] = useState<Video[]>([])
  const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set())
  const [savedVideos, setSavedVideos] = useState<Set<string>>(new Set())
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set())
  const [newComment, setNewComment] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentText, setEditCommentText] = useState('')
  const [feedTab, setFeedTab] = useState<'foryou' | 'following'>('foryou')
  const [heartAnim, setHeartAnim] = useState<string | null>(null)
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set())
  const [showMore, setShowMore] = useState<string | null>(null)
  const [reportVideoId, setReportVideoId] = useState<string | null>(null)
  const [shareVideoId, setShareVideoId] = useState<string | null>(null)
  const [progressMap, setProgressMap] = useState<Record<string, number>>({})
  const [shareFriends, setShareFriends] = useState<
    { id: string; username: string | null; full_name: string | null; avatar_url: string | null }[]
  >([])
  const [loadingShareFriends, setLoadingShareFriends] = useState(false)
  const [sharingTo, setSharingTo] = useState<string | null>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [showMentions, setShowMentions] = useState(false)
  const [mentionResults, setMentionResults] = useState<
    { id: string; username: string | null; full_name: string | null; avatar_url: string | null }[]
  >([])
  const [mentionLoading, setMentionLoading] = useState(false)
  const [displayCount, setDisplayCount] = useState(5)
  const [activeIndex, setActiveIndex] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [expandedCaptions, setExpandedCaptions] = useState<Set<string>>(new Set())
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    try {
      if (localStorage.getItem('serulo_auto_scroll') === '0') setAutoScroll(false)
    } catch {}
  }, [])

  const PAGE_SIZE = 5

  const router = useRouter()
  const supabase = createClient()
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([])
  const lastTapRef = useRef<{ time: number; videoId: string } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const startYRef = useRef(0)
  const isPullingRef = useRef(false)
  const viewedIdsRef = useRef<Set<string>>(new Set())
  const userPausedRef = useRef<Set<string>>(new Set())
  const watchAccRef = useRef<Record<string, number>>({}) // ms tertonton
  const notInterestedRef = useRef<Set<string>>(new Set())

  const filteredVideos =
    feedTab === 'foryou'
      ? allVideos.filter((v) => !blockedUsers.has(v.user_id))
      : allVideos.filter((v) => following.has(v.user_id) && !blockedUsers.has(v.user_id))

  const videos = filteredVideos.slice(0, displayCount)
  const hasMore = displayCount < filteredVideos.length

  const REPORT_REASONS = [
    'Spam',
    'Konten tidak pantas',
    'Kekerasan atau berbahaya',
    'Pelecehan atau bullying',
    'Informasi palsu',
    'Lainnya',
  ]

  const loadFeed = async (uid: string) => {
    const { data: blocksData } = await supabase
      .from('blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${uid},blocked_id.eq.${uid}`)

    const blockedSet = new Set<string>()
    ;(blocksData || []).forEach((b) => {
      if (b.blocker_id === uid) blockedSet.add(b.blocked_id)
      if (b.blocked_id === uid) blockedSet.add(b.blocker_id)
    })
    setBlockedUsers(blockedSet)

        const { data: ni } = await supabase
      .from('video_not_interested')
      .select('video_id')
      .eq('user_id', uid)
    const niSet = new Set((ni || []).map((r) => r.video_id))
    notInterestedRef.current = niSet

    // Sinyal tonton user ini (untuk ranking)
    const { data: myViews } = await supabase
      .from('video_views')
      .select('video_id, watch_ms, completed')
      .eq('user_id', uid)
      .limit(200)

    const watchMap = new Map<string, { watch_ms: number; completed: boolean }>()
    ;(myViews || []).forEach((r) => {
      watchMap.set(r.video_id, {
        watch_ms: r.watch_ms || 0,
        completed: !!r.completed,
      })
    })

    const { data: followData } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', uid)
    const followingSet = new Set(followData?.map((f) => f.following_id) || [])
    setFollowing(followingSet)

    const { data: videosData } = await supabase
      .from('videos')
      .select(`
        id, caption, video_url, thumbnail_url, likes_count, comments_count, comments_enabled,
        saves_count, shares_count, visibility, views_count, sound_name, created_at, user_id,
        profiles ( username, full_name, avatar_url, is_private )
      `)
      .eq('is_draft', false)
      .order('created_at', { ascending: false })
      .limit(40)

    const filtered = (videosData || []).filter((v: any) => {
      if (blockedSet.has(v.user_id)) return false
      if (niSet.has(v.id)) return false
      const vis = String(v.visibility ?? 'public').toLowerCase().replace(/['"]/g, '').trim()
      if (vis === 'private') return false
      if (v.user_id === uid) return true
      const isPrivateAccount = v.profiles?.is_private === true
      const isFollower = followingSet.has(v.user_id)
      if (isPrivateAccount && !isFollower) return false
      if (vis === 'followers' && !isFollower) return false
      return true
    })

    const creatorBoost = new Map<string, number>()
    ;(myViews || []).forEach((r) => {
      const vid = filtered.find((x: any) => x.id === r.video_id)
      if (!vid) return
      const add =
        (r.completed ? 6 : 0) +
        Math.min(8, Math.floor((r.watch_ms || 0) / 3000))
      if (add > 0) {
        creatorBoost.set(
          vid.user_id,
          Math.min(20, (creatorBoost.get(vid.user_id) || 0) + add)
        )
      }
    })

    const scoreVideo = (v: any, isFollower: boolean) => {
      const likes = v.likes_count || 0
      const comments = v.comments_count || 0
      const saves = v.saves_count || 0
      const shares = v.shares_count || 0
      const views = v.views_count || 0

      let score =
        likes * 3 +
        comments * 4 +
        saves * 5 +
        shares * 6 +
        Math.log10(views + 1) * 2

      const ageHours =
        (Date.now() - new Date(v.created_at).getTime()) / (1000 * 60 * 60)
      score += Math.max(0, 72 - ageHours) * 0.8

      if (isFollower) score += 10

      const w = watchMap.get(v.id)
      if (w) {
        if (w.watch_ms < 1500) score -= 25
        else if (w.completed) score -= 8
        else if (w.watch_ms > 5000) score -= 4
      }

      score += creatorBoost.get(v.user_id) || 0
      score += Math.random() * 25
      return score
    }

    const scored = filtered.map((v: any) => ({
      v,
      s: scoreVideo(v, followingSet.has(v.user_id)),
    }))
    scored.sort((a, b) => b.s - a.s)

    const TOP_POOL = Math.min(12, scored.length)
    const topPool = scored.slice(0, TOP_POOL)
    const restPool = scored.slice(TOP_POOL)

    for (let i = topPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[topPool[i], topPool[j]] = [topPool[j], topPool[i]]
    }

    const ordered = [...topPool, ...restPool]
    const ranked: any[] = []
    const rest = [...ordered]
    let lastUserId: string | null = null
    while (rest.length > 0) {
      let idx = rest.findIndex((x) => x.v.user_id !== lastUserId)
      if (idx === -1) idx = 0
      const picked = rest.splice(idx, 1)[0]
      ranked.push(picked.v)
      lastUserId = picked.v.user_id
    }

    setAllVideos(ranked as any)
    setDisplayCount(PAGE_SIZE)

    const { data: likesData } = await supabase.from('likes').select('video_id').eq('user_id', uid)
    if (likesData) setLikedVideos(new Set(likesData.map((l) => l.video_id)))

    const { data: savesData } = await supabase.from('saves').select('video_id').eq('user_id', uid)
    if (savesData) setSavedVideos(new Set(savesData.map((s) => s.video_id)))
  }

  const registerView = async (videoId: string) => {
    if (viewedIdsRef.current.has(videoId)) return
    viewedIdsRef.current.add(videoId)

    const { error } = await supabase.rpc('increment_views', { video_id: videoId })
    if (error) {
      const video = allVideos.find((v) => v.id === videoId)
      await supabase
        .from('videos')
        .update({ views_count: (video?.views_count || 0) + 1 })
        .eq('id', videoId)
    }
  }

  const flushedWatchRef = useRef<Set<string>>(new Set())

  const flushWatch = async (videoId: string, durationSec?: number) => {
    if (!userId) return
    const ms = watchAccRef.current[videoId] || 0
    if (ms < 400) return

    // Jangan spam upsert: max 1x per video per session (kecuali completed)
    const completed =
      typeof durationSec === 'number' && durationSec > 0
        ? ms / 1000 >= durationSec * 0.85
        : false

    const key = `${videoId}:${completed ? 'done' : 'partial'}`
    if (!completed && flushedWatchRef.current.has(videoId)) return
    if (completed && flushedWatchRef.current.has(key)) return
    flushedWatchRef.current.add(videoId)
    if (completed) flushedWatchRef.current.add(key)

    await supabase.from('video_views').upsert(
      {
        user_id: userId,
        video_id: videoId,
        watch_ms: Math.round(ms),
        completed,
      },
      { onConflict: 'user_id,video_id' }
    )
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
      await loadFeed(user.id)
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    videoRefs.current = []
    setDisplayCount(PAGE_SIZE)
  }, [feedTab])

  useEffect(() => {
    if (videos.length === 0) return

    const pauseAllExcept = (active: HTMLVideoElement | null) => {
      videoRefs.current.forEach((v) => {
        if (!v || v === active) return
        v.pause()
      })
    }

    const tryPlay = (el: HTMLVideoElement) => {
      const vid = el.dataset.videoId
      if (vid && userPausedRef.current.has(vid)) return

      el.muted = isMuted
      const p = el.play()
      if (p && typeof p.then === 'function') {
        p.catch(() => {
          el.muted = true
          el.play().catch(() => {})
        })
      }
      if (vid) registerView(vid)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        let bestEntry: IntersectionObserverEntry | null = null
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            ;(entry.target as HTMLVideoElement).pause()
            continue
          }
          if (!bestEntry || entry.intersectionRatio > bestEntry.intersectionRatio) {
            bestEntry = entry
          }
        }
        if (bestEntry && bestEntry.intersectionRatio >= 0.55) {
          const el = bestEntry.target as HTMLVideoElement
          pauseAllExcept(el)
          tryPlay(el)

          const idx = videoRefs.current.findIndex((v) => v === el)
          if (idx >= 0) {
            setActiveIndex(idx)
            if (idx >= videos.length - 2) {
              loadMore()
            }
          }
        }
      },
      { threshold: [0.25, 0.55, 0.75, 0.9], rootMargin: '0px' }
    )

    const t = setTimeout(() => {
      videoRefs.current.forEach((video) => {
        if (video) observer.observe(video)
      })
      const first = videoRefs.current[0]
      if (first) {
        pauseAllExcept(first)
        tryPlay(first)
      }
    }, 80)

    return () => {
  clearTimeout(t)
  observer.disconnect()

  // Pause semua video biar ga makan resource pas pindah tab
  videoRefs.current.forEach((v) => {
    if (v) {
      v.pause()
    }
  })
}
  }, [videos, isMuted, feedTab])
  // Buffer ketat ±1; restore src saat kembali ke viewport (scroll atas)
  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return
      const dist = Math.abs(i - activeIndex)
      const url = videos[i]?.video_url
      if (!url) return

      if (dist <= 1) {
        if (!v.getAttribute('src')) {
          v.src = url
          // jangan v.load() berulang — biarkan browser handle
        }
        return
      }

      // Jauh: lepas biar hemat, tapi cuma pause dulu di dist===2
      if (dist === 2) {
        v.pause()
        return
      }

      if (v.getAttribute('src')) {
        v.pause()
        v.removeAttribute('src')
        try {
          v.load()
        } catch {}
      }
    })
  }, [activeIndex, videos])

  const loadMore = () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    // sedikit delay biar UI sempat tampil (opsional)
    setDisplayCount((c) => c + PAGE_SIZE)
    setLoadingMore(false)
  }
  const handleRefresh = async () => {
    if (!userId || refreshing) return
    setRefreshing(true)
    await loadFeed(userId)
    setRefreshing(false)
    setPullDistance(0)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    const el = containerRef.current
    if (!el || el.scrollTop > 5) return
    startYRef.current = e.touches[0].clientY
    isPullingRef.current = true
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isPullingRef.current || refreshing) return
    const el = containerRef.current
    if (!el || el.scrollTop > 5) {
      isPullingRef.current = false
      setPullDistance(0)
      return
    }
    const diff = e.touches[0].clientY - startYRef.current
    if (diff > 0) setPullDistance(Math.min(diff * 0.5, 80))
  }

  const onTouchEnd = () => {
    if (!isPullingRef.current) return
    isPullingRef.current = false
    if (pullDistance > 50) handleRefresh()
    else setPullDistance(0)
  }

  const toggleLike = async (videoId: string) => {
    if (!userId) return
    const isLiked = likedVideos.has(videoId)
    if (isLiked) {
      await supabase.from('likes').delete().eq('user_id', userId).eq('video_id', videoId)
      await supabase.rpc('decrement_likes', { video_id: videoId })
      setLikedVideos((prev) => {
        const next = new Set(prev)
        next.delete(videoId)
        return next
      })
      setAllVideos((prev) =>
        prev.map((v) =>
          v.id === videoId ? { ...v, likes_count: Math.max(0, v.likes_count - 1) } : v
        )
      )
    } else {
      const { error } = await supabase.from('likes').insert({ user_id: userId, video_id: videoId })
      if (error) return
      await supabase.rpc('increment_likes', { video_id: videoId })
      setLikedVideos((prev) => new Set(prev).add(videoId))
      setAllVideos((prev) =>
        prev.map((v) =>
          v.id === videoId ? { ...v, likes_count: v.likes_count + 1 } : v
        )
      )
      const video = allVideos.find((v) => v.id === videoId)
      if (video && video.user_id !== userId) {
        await insertNotification(supabase, {
          user_id: video.user_id,
          actor_id: userId,
          type: 'like',
          video_id: videoId,
        })
      }
    }
  }

  const toggleSave = async (videoId: string) => {
    if (!userId) return
    const isSaved = savedVideos.has(videoId)

    if (isSaved) {
      await supabase.from('saves').delete().eq('user_id', userId).eq('video_id', videoId)
      const { error: rpcErr } = await supabase.rpc('decrement_saves', { video_id: videoId })
      if (rpcErr) {
        const cur = allVideos.find((v) => v.id === videoId)?.saves_count || 0
        await supabase
          .from('videos')
          .update({ saves_count: Math.max(0, cur - 1) })
          .eq('id', videoId)
      }
      setSavedVideos((prev) => {
        const next = new Set(prev)
        next.delete(videoId)
        return next
      })
      setAllVideos((prev) =>
        prev.map((v) =>
          v.id === videoId
            ? { ...v, saves_count: Math.max(0, (v.saves_count || 0) - 1) }
            : v
        )
      )
    } else {
      const { error } = await supabase
        .from('saves')
        .insert({ user_id: userId, video_id: videoId })
      if (error) {
        toast('Gagal simpan: ' + error.message, 'error')
        return
      }
      const { error: rpcErr } = await supabase.rpc('increment_saves', { video_id: videoId })
      if (rpcErr) {
        const cur = allVideos.find((v) => v.id === videoId)?.saves_count || 0
        await supabase
          .from('videos')
          .update({ saves_count: cur + 1 })
          .eq('id', videoId)
      }
      setSavedVideos((prev) => new Set(prev).add(videoId))
      setAllVideos((prev) =>
        prev.map((v) =>
          v.id === videoId
            ? { ...v, saves_count: (v.saves_count || 0) + 1 }
            : v
        )
      )
      const owner = allVideos.find((v) => v.id === videoId)
      if (owner && owner.user_id !== userId) {
                await insertNotification(supabase, {
          user_id: owner.user_id,
          actor_id: userId,
          type: 'save',
          video_id: videoId,
        })
      }
    }
  }

  const handleVideoTap = (videoId: string, videoEl: HTMLVideoElement) => {
    const now = Date.now()
    const last = lastTapRef.current
    if (last && last.videoId === videoId && now - last.time < 300) {
      lastTapRef.current = null
      if (!likedVideos.has(videoId)) toggleLike(videoId)
      setHeartAnim(videoId)
      setTimeout(() => setHeartAnim(null), 800)
      // double-tap like: biarkan video tetap play
      userPausedRef.current.delete(videoId)
      if (videoEl.paused) videoEl.play().catch(() => {})
    } else {
      lastTapRef.current = { time: now, videoId }
      if (videoEl.paused) {
        userPausedRef.current.delete(videoId)
        videoEl.play().catch(() => {})
      } else {
        userPausedRef.current.add(videoId)
        videoEl.pause()
      }
    }
  }

  const toggleFollow = async (targetUserId: string) => {
    if (!userId || userId === targetUserId) return
    const isFollowing = following.has(targetUserId)
    if (isFollowing) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', userId)
        .eq('following_id', targetUserId)
      setFollowing((prev) => {
        const next = new Set(prev)
        next.delete(targetUserId)
        return next
      })
    } else {
      const { error } = await supabase
        .from('follows')
        .insert({ follower_id: userId, following_id: targetUserId })
      if (error) return
      setFollowing((prev) => new Set(prev).add(targetUserId))
      await insertNotification(supabase, {
        user_id: targetUserId,
        actor_id: userId,
        type: 'follow',
      })
    }
  }

  const openComments = async (videoId: string) => {
    setActiveVideoId(videoId)
    setShowComments(true)
    setLoadingComments(true)
    setReplyTo(null)
    setEditingCommentId(null)

    const { data } = await supabase
      .from('comments')
      .select(`
        id, content, created_at, user_id, parent_id, likes_count,
        profiles ( username, avatar_url )
      `)
      .eq('video_id', videoId)
      .order('created_at', { ascending: true })

    if (data) setComments(data as any)

    if (userId && data && data.length > 0) {
      const ids = data.map((c: any) => c.id)
      const { data: myLikes } = await supabase
        .from('comment_likes')
        .select('comment_id')
        .eq('user_id', userId)
        .in('comment_id', ids)
      setLikedComments(new Set((myLikes || []).map((l) => l.comment_id)))
    } else {
      setLikedComments(new Set())
    }
    setLoadingComments(false)
  }

  const submitComment = async () => {
    if (!newComment.trim() || !userId || !activeVideoId) return
    const content = newComment.trim()
    const parentId = replyTo?.id || null

    const { error } = await supabase.from('comments').insert({
      video_id: activeVideoId,
      user_id: userId,
      content,
      parent_id: parentId,
    })
    if (error) {
      toast('Gagal kirim komentar: ' + error.message, 'error')
      return
    }

    await supabase.rpc('increment_comments', { video_id: activeVideoId })
    setAllVideos((prev) =>
      prev.map((v) =>
        v.id === activeVideoId
          ? { ...v, comments_count: (v.comments_count || 0) + 1 }
          : v
      )
    )
    setNewComment('')
    setReplyTo(null)

    const video = allVideos.find((v) => v.id === activeVideoId)
    if (parentId && replyTo && replyTo.user_id !== userId) {
      await insertNotification(supabase, {
        user_id: replyTo.user_id,
        actor_id: userId,
        type: 'comment',
        video_id: activeVideoId,
        message: content,
      })
    } else if (!parentId && video && video.user_id !== userId) {
      await insertNotification(supabase, {
        user_id: video.user_id,
        actor_id: userId,
        type: 'comment',
        video_id: activeVideoId,
        message: content,
      })
    }

    await notifyMentions(supabase, {
      text: content,
      actorId: userId,
      videoId: activeVideoId,
      excludeUserIds: [
        ...(replyTo ? [replyTo.user_id] : []),
        ...(video ? [video.user_id] : []),
      ],
    })

    await openComments(activeVideoId)
  }

  const searchMentions = async (q: string) => {
    if (!userId) return
    setMentionLoading(true)
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)
    const ids = follows?.map((f) => f.following_id) || []
    if (ids.length === 0) {
      setMentionResults([])
      setMentionLoading(false)
      return
    }
    let query = supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', ids)
      .limit(8)
    if (q.trim()) {
      query = query.or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
    }
    const { data } = await query
    setMentionResults(data || [])
    setMentionLoading(false)
  }

  const insertMention = (username: string) => {
    if (!username) return
    setNewComment((prev) => prev.replace(/@([a-zA-Z0-9._]*)$/, `@${username} `))
    setShowMentions(false)
    setMentionResults([])
  }

  const toggleCommentLike = async (commentId: string) => {
    if (!userId) return
    const isLiked = likedComments.has(commentId)
    if (isLiked) {
      await supabase
        .from('comment_likes')
        .delete()
        .eq('user_id', userId)
        .eq('comment_id', commentId)
      try {
        await supabase.rpc('decrement_comment_likes', { comment_id: commentId })
      } catch {}
      setLikedComments((prev) => {
        const next = new Set(prev)
        next.delete(commentId)
        return next
      })
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, likes_count: Math.max(0, (c.likes_count || 0) - 1) }
            : c
        )
      )
    } else {
      const { error } = await supabase
        .from('comment_likes')
        .insert({ user_id: userId, comment_id: commentId })
      if (error) return
      try {
        await supabase.rpc('increment_comment_likes', { comment_id: commentId })
      } catch {}
      setLikedComments((prev) => new Set(prev).add(commentId))
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, likes_count: (c.likes_count || 0) + 1 } : c
        )
      )
    }
  }

  const startEditComment = (c: Comment) => {
    setEditingCommentId(c.id)
    setEditCommentText(c.content)
    setReplyTo(null)
  }

  const saveEditComment = async () => {
    if (!editingCommentId || !editCommentText.trim() || !userId) return
    const { error } = await supabase
      .from('comments')
      .update({ content: editCommentText.trim() })
      .eq('id', editingCommentId)
      .eq('user_id', userId)
    if (error) {
      toast('Gagal edit: ' + error.message, 'error')
      return
    }
    setComments((prev) =>
      prev.map((c) =>
        c.id === editingCommentId ? { ...c, content: editCommentText.trim() } : c
      )
    )
    setEditingCommentId(null)
    setEditCommentText('')
  }

  const deleteComment = async (comment: Comment) => {
    if (!userId || !activeVideoId) return
    if (!confirm('Hapus komentar ini?')) return
    const replyIds = comments.filter((c) => c.parent_id === comment.id).map((c) => c.id)
    const idsToDelete = [comment.id, ...replyIds]
    const { error } = await supabase.from('comments').delete().in('id', idsToDelete)
    if (error) {
      toast('Gagal hapus: ' + error.message, 'error')
      return
    }
    for (let i = 0; i < idsToDelete.length; i++) {
      try {
        await supabase.rpc('decrement_comments', { video_id: activeVideoId })
      } catch {}
    }
    setAllVideos((prev) =>
      prev.map((v) =>
        v.id === activeVideoId
          ? { ...v, comments_count: Math.max(0, (v.comments_count || 0) - idsToDelete.length) }
          : v
      )
    )
    setComments((prev) => prev.filter((c) => !idsToDelete.includes(c.id)))
  }

  const handleDeleteVideo = async (videoId: string) => {
    if (!userId) return
    if (!confirm('Hapus video ini?')) return
    const { error } = await supabase
      .from('videos')
      .delete()
      .eq('id', videoId)
      .eq('user_id', userId)
    if (error) {
      toast('Gagal hapus: ' + error.message, 'error')
      return
    }
    setShowMore(null)
    setAllVideos((prev) => prev.filter((v) => v.id !== videoId))
  }

  const openShare = async (videoId: string) => {
    setShareVideoId(videoId)
    if (!userId) return
    setLoadingShareFriends(true)
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)
    const ids = follows?.map((f) => f.following_id) || []
    if (ids.length === 0) {
      setShareFriends([])
      setLoadingShareFriends(false)
      return
    }
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', ids)
      .limit(40)
    setShareFriends(profiles || [])
    setLoadingShareFriends(false)
  }

  const shareVideoToFriend = async (friendId: string) => {
    if (!userId || !shareVideoId) return
    setSharingTo(friendId)
    const { error } = await supabase.from('messages').insert({
      sender_id: userId,
      receiver_id: friendId,
      content: `__VIDEO__:${shareVideoId}`,
      is_read: false,
    })
    setSharingTo(null)
    if (error) {
      toast('Gagal kirim video: ' + error.message, 'error')
      return
    }
    const video = allVideos.find((v) => v.id === shareVideoId)
    const nextCount = (video?.shares_count || 0) + 1
    setAllVideos((prev) =>
      prev.map((v) =>
        v.id === shareVideoId ? { ...v, shares_count: nextCount } : v
      )
    )
    const { error: shareErr } = await supabase.rpc('increment_shares', {
      video_id: shareVideoId,
    })
    if (shareErr) {
      await supabase
        .from('videos')
        .update({ shares_count: nextCount })
        .eq('id', shareVideoId)
    }

    const owner = allVideos.find((v) => v.id === shareVideoId)
    if (owner && owner.user_id !== userId) {
      await insertNotification(supabase, {
        user_id: owner.user_id,
        actor_id: userId,
        type: 'share',
        video_id: shareVideoId,
      })
    }

    toast('Video terkirim!', 'success')
    setShareVideoId(null)
  }

  const shareToOtherApps = async () => {
    if (!shareVideoId || !userId) return
    const url = `${window.location.origin}/v/${shareVideoId}`
    const bumpShare = async () => {
      const video = allVideos.find((v) => v.id === shareVideoId)
      const nextCount = (video?.shares_count || 0) + 1
      setAllVideos((prev) =>
        prev.map((v) =>
          v.id === shareVideoId ? { ...v, shares_count: nextCount } : v
        )
      )
      const { error: shareErr } = await supabase.rpc('increment_shares', {
        video_id: shareVideoId,
      })
      if (shareErr) {
        await supabase
          .from('videos')
          .update({ shares_count: nextCount })
          .eq('id', shareVideoId)
      }
      const owner = allVideos.find((v) => v.id === shareVideoId)
      if (owner && owner.user_id !== userId) {
              await insertNotification(supabase, {
        user_id: owner.user_id,
        actor_id: userId,
        type: 'share',
        video_id: shareVideoId,
      })
      }
    }

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'SERULO', text: 'Lihat video ini di SERULO!', url })
        await bumpShare()
        setShareVideoId(null)
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url)
        toast('Tautan disalin', 'success')
        await bumpShare()
        setShareVideoId(null)
      } catch {
        prompt('Salin tautan:', url)
      }
    }
  }

  const submitReport = async (reason: string) => {
    if (!userId || !reportVideoId) return

    const video = allVideos.find((v) => v.id === reportVideoId)
    if (!video) {
      toast('Video tidak ditemukan', 'error')
      return
    }

    const { error } = await supabase.from('reports').insert({
      video_id: reportVideoId,
      reporter_id: userId,
      reported_user_id: video.user_id,
      reason,
      video_url: video.video_url,
    })

    if (error) {
      toast('Gagal report: ' + error.message, 'error')
      return
    }
    toast('Laporan terkirim. Terima kasih.', 'success')
    setReportVideoId(null)
  }

  if (loading) {
  return (
    <div className="h-screen w-full bg-black">
      <div className="h-screen w-full max-w-[480px] mx-auto bg-black relative overflow-hidden">
        {/* Background skeleton */}
        <div className="absolute inset-0 bg-zinc-900">
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-800/40 via-transparent to-zinc-900/80" />
        </div>

        {/* Top tabs skeleton */}
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-center gap-6 pt-4">
          <div className="h-4 w-16 bg-zinc-700/60 rounded-full animate-pulse" />
          <div className="h-4 w-14 bg-zinc-600/80 rounded-full animate-pulse" />
        </div>

        {/* Mute button skeleton */}
        <div className="absolute top-3 right-3 z-40 w-10 h-9 rounded-full bg-zinc-800/80 animate-pulse" />

        {/* Bottom content skeleton (avatar + text) */}
        <div className="absolute bottom-28 left-4 right-20 z-10 space-y-3">
          {/* Avatar + username + follow */}
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-9 rounded-full bg-zinc-700 animate-pulse shrink-0" />
            <div className="h-3.5 w-24 bg-zinc-700/90 rounded animate-pulse" />
            <div className="h-6 w-14 rounded-full bg-zinc-700/70 animate-pulse" />
          </div>

          {/* Caption lines */}
          <div className="space-y-1.5">
            <div className="h-3 w-full max-w-[240px] bg-zinc-800 rounded animate-pulse" />
            <div className="h-3 w-[180px] bg-zinc-800/80 rounded animate-pulse" />
          </div>

          {/* Sound line */}
          <div className="flex items-center gap-1.5 mt-1">
            <div className="h-3 w-3 rounded-full bg-zinc-700 animate-pulse" />
            <div className="h-2.5 w-36 bg-zinc-800 rounded animate-pulse" />
          </div>
        </div>

        {/* Right side action buttons skeleton */}
        <div className="absolute right-2.5 bottom-32 flex flex-col items-center gap-4 z-10">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full bg-zinc-700/80 animate-pulse" />
              <div className="h-2 w-5 bg-zinc-800 rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* Progress bar skeleton */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/10">
          <div className="h-full w-1/3 bg-white/20 animate-pulse" />
        </div>

        <BottomNav />
      </div>
    </div>
  )
  }

  return (
    <div className="h-[100dvh] w-full bg-black flex justify-center overflow-hidden">
      <div className="h-[100dvh] w-full max-w-[480px] lg:max-w-[520px] bg-black text-white overflow-hidden relative border-x border-white/5">
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-center gap-6 pt-3 pb-4 pointer-events-none bg-gradient-to-b from-[#0b0614]/85 via-[#0b0614]/40 to-transparent backdrop-blur-[2px]">
          <button
            onClick={() => setFeedTab('following')}
            className={`text-sm font-semibold pointer-events-auto ${
              feedTab === 'following' ? 'text-white' : 'text-white/50'
            }`}
          >
            Following
          </button>
          <button
            onClick={() => setFeedTab('foryou')}
            className={`text-sm font-semibold pointer-events-auto ${
              feedTab === 'foryou' ? 'text-white' : 'text-white/50'
            }`}
          >
            For You
          </button>
        </div>

        <div
          ref={containerRef}
          className="h-[100dvh] overflow-y-scroll snap-y snap-mandatory overscroll-y-contain pb-16 md:pb-0 scrollbar-hide"
          style={{
            scrollSnapType: 'y mandatory',
            WebkitOverflowScrolling: 'touch',
            overscrollBehaviorY: 'contain',
            paddingTop: pullDistance > 0 ? pullDistance : 0,
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {refreshing && (
            <div className="text-center text-xs text-white/70 py-2">Refresh...</div>
          )}

          {videos.length === 0 ? (
            <div className="h-[100dvh] flex flex-col items-center justify-center px-6 text-center pb-16">
              <div className="text-4xl mb-3">🎬</div>
              <p className="font-semibold text-sm text-white mb-1">
                {feedTab === 'following' ? 'Following masih kosong' : 'Belum ada video'}
              </p>
              <p className="text-xs text-gray-500 mb-5 max-w-[260px]">
                {feedTab === 'following'
                  ? 'Follow akun lain biar video mereka muncul di sini'
                  : 'Jadilah yang pertama upload di SERULO'}
              </p>
              <button
                onClick={() =>
                  router.push(feedTab === 'following' ? '/search' : '/upload')
                }
                className="bg-vezao-gradient px-6 py-2.5 rounded-full text-sm font-semibold"
              >
                {feedTab === 'following' ? 'Cari orang' : 'Upload Video'}
              </button>
            </div>
          ) : (
            videos.map((video, index) => (
              <div
                key={video.id}
                className="h-[100dvh] w-full snap-start snap-always relative flex items-center justify-center feed-item"
                style={{ scrollSnapStop: 'always' }}
              >
                <video
                  ref={(el) => {
                    videoRefs.current[index] = el
                  }}
                  data-video-id={video.id}
                  src={
                    index >= activeIndex - 1 && index <= activeIndex + 1
                      ? video.video_url
                      : undefined
                  }
                  poster={video.thumbnail_url || undefined}
                  className="absolute inset-0 w-full h-full object-cover"
                  loop={!autoScroll}
                  muted={isMuted}
                  playsInline
                  preload={
                    index === activeIndex
                      ? 'auto'
                      : index === activeIndex - 1 || index === activeIndex + 1
                      ? 'metadata'
                      : 'none'
                  }
                  onClick={(e) => handleVideoTap(video.id, e.currentTarget)}
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget
                    if (!v.duration || !isFinite(v.duration)) return
                    watchAccRef.current[video.id] =
                      (watchAccRef.current[video.id] || 0) + 250
                    const pct = Math.min(100, (v.currentTime / v.duration) * 100)
                    setProgressMap((prev) => {
                      const old = prev[video.id] || 0
                      if (Math.abs(old - pct) < 12) return prev
                      return { ...prev, [video.id]: pct }
                    })
                  }}
                  onPause={() => {
                    void flushWatch(video.id)
                  }}
                  onEnded={(e) => {
                    setProgressMap((prev) => ({ ...prev, [video.id]: 0 }))
                    void flushWatch(video.id, e.currentTarget.duration)

                    if (!autoScroll) return
                    const next = index + 1
                    if (next >= videos.length) {
                      // video terakhir → putar ulang
                      e.currentTarget.currentTime = 0
                      e.currentTarget.play().catch(() => {})
                      return
                    }
                    const container = containerRef.current
                    if (!container) return
                    const items = container.querySelectorAll('.feed-item')
                    const el = items[next] as HTMLElement | undefined
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    } else {
                      container.scrollTo({
                        top: next * container.clientHeight,
                        behavior: 'smooth',
                      })
                    }
                    if (next >= videos.length - 2) loadMore()
                  }}
                />

                <div className="absolute top-0 left-0 right-0 z-20 h-[2.5px] bg-white/25 pointer-events-none">
                  <div
                    className="h-full bg-white"
                    style={{ width: `${progressMap[video.id] || 0}%` }}
                  />
                </div>

                {heartAnim === video.id && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                    <span className="text-7xl text-red-500 animate-ping">♥</span>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />
                <div className="absolute bottom-20 md:bottom-8 left-4 right-20 text-white z-10">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div
                      className="flex items-center gap-2 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/@${video.profiles?.username || video.user_id}`)
                      }}
                    >
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700 border border-white/20">
                        {video.profiles?.avatar_url ? (
                          <img
                            src={video.profiles.avatar_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold bg-vezao-gradient">
                            {video.profiles?.username?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                      </div>
                      <p className="font-semibold text-sm">
                        @{video.profiles?.username || 'user'}
                      </p>
                    </div>
                    {userId !== video.user_id && (
                      <button
                        onClick={() => toggleFollow(video.user_id)}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          following.has(video.user_id)
                            ? 'bg-white/20 text-white'
                            : 'bg-vezao-gradient text-white'
                        }`}
                      >
                        {following.has(video.user_id) ? 'Following' : 'Follow'}
                      </button>
                    )}
                  </div>

                  {video.caption && (
                    <div className="text-sm opacity-90 relative">
                      <p
                        className={
                          expandedCaptions.has(video.id)
                            ? 'whitespace-pre-wrap'
                            : 'line-clamp-2 overflow-hidden'
                        }
                        style={
                          expandedCaptions.has(video.id)
                            ? undefined
                            : {
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                              }
                        }
                      >
                        {renderTextWithMentions(
                          video.caption,
                          (uname) => router.push(`/@${uname}`),
                          (tag) => router.push(`/hashtag?tag=${tag}`)
                        )}
                      </p>

                      {video.caption.length > 70 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedCaptions((prev) => {
                              const next = new Set(prev)
                              if (next.has(video.id)) next.delete(video.id)
                              else next.add(video.id)
                              return next
                            })
                          }}
                          className="text-white/70 text-xs mt-1 font-medium"
                        >
                          {expandedCaptions.has(video.id)
                            ? 'tampilkan sedikit'
                            : 'tampilkan selengkapnya'}
                        </button>
                      )}
                    </div>
                  )}

                  {expandedCaptions.has(video.id) && (
                    <div className="mt-1.5 space-y-0.5">
                      <p
                        onClick={(e) => {
                          e.stopPropagation()
                          const name =
                            video.sound_name ||
                            `Original sound - @${video.profiles?.username || 'user'}`
                          router.push(`/sound?name=${encodeURIComponent(name)}`)
                        }}
                        className="text-[11px] text-white/70 flex items-center gap-1 cursor-pointer max-w-[90%]"
                      >
                        <span>♪</span>
                        <span className="truncate">
                          {video.sound_name ||
                            `Original sound - @${video.profiles?.username || 'user'}`}
                        </span>
                      </p>
                      <p className="text-[11px] text-white/40">
                        {formatDateTime(video.created_at)}
                      </p>
                    </div>
                  )}
                </div>

                <div className="absolute right-1.5 bottom-20 md:bottom-6 flex flex-col items-center gap-2 z-10">
                  <button onClick={() => toggleLike(video.id)} className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        likedVideos.has(video.id)
                          ? 'bg-red-500'
                          : 'bg-black/45 border border-white/10'
                      }`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-4 h-4 text-white"
                        fill={likedVideos.has(video.id) ? 'currentColor' : 'none'}
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                        />
                      </svg>
                    </div>
                    <span className="text-[10px] mt-0.5 text-white font-medium drop-shadow">
                      {video.likes_count}
                    </span>
                  </button>

                  <button
                    onClick={() => openComments(video.id)}
                    className="flex flex-col items-center"
                  >
                    <div className="w-8 h-8 rounded-full bg-black/45 border border-white/10 flex items-center justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-4 h-4 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                    </div>
                    <span className="text-[10px] mt-0.5 text-white font-medium drop-shadow">
                      {video.comments_count || 0}
                    </span>
                  </button>

                  <button onClick={() => toggleSave(video.id)} className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-black/45 border border-white/10 flex items-center justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`w-4 h-4 ${
                          savedVideos.has(video.id) ? 'text-yellow-400' : 'text-white'
                        }`}
                        fill={savedVideos.has(video.id) ? 'currentColor' : 'none'}
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                        />
                      </svg>
                    </div>
                    <span className="text-[10px] mt-0.5 text-white font-medium drop-shadow">
                      {video.saves_count || 0}
                    </span>
                  </button>

                  <button onClick={() => openShare(video.id)} className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-black/45 border border-white/10 flex items-center justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-4 h-4 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                        />
                      </svg>
                    </div>
                    <span className="text-[10px] mt-0.5 text-white font-medium drop-shadow">
                      {video.shares_count || 0}
                    </span>
                  </button>

                  <button
                    onClick={() => setShowMore(video.id)}
                    className="w-8 h-8 rounded-full bg-black/45 border border-white/10 flex items-center justify-center"
                  >
                    <span className="text-sm leading-none text-white">⋯</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <BottomNav />

        {showComments && (
          <div className="fixed inset-0 z-[60] flex items-end">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => {
                setShowComments(false)
                setEditingCommentId(null)
                setReplyTo(null)
              }}
            />
            <div className="relative w-full bg-zinc-900 rounded-t-2xl max-h-[75vh] flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <h3 className="font-semibold">Comments</h3>
                <button
                  onClick={() => {
                    setShowComments(false)
                    setEditingCommentId(null)
                    setReplyTo(null)
                  }}
                  className="text-gray-400 text-lg"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                {loadingComments ? (
                  <p className="text-center text-gray-500 py-8">Loading...</p>
                ) : comments.filter((c) => !c.parent_id).length === 0 ? (
                  <p className="text-center text-gray-500 py-8">Belum ada komentar</p>
                ) : (
                  comments
                    .filter((c) => !c.parent_id)
                    .map((c) => {
                      const replies = comments.filter((r) => r.parent_id === c.id)
                      const isOwn = c.user_id === userId
                      return (
                        <div key={c.id} className="space-y-2">
                          <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700 shrink-0">
                              {c.profiles?.avatar_url ? (
                                <img
                                  src={c.profiles.avatar_url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs font-bold bg-vezao-gradient">
                                  {c.profiles?.username?.[0]?.toUpperCase() || 'U'}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-sm font-semibold cursor-pointer"
                                onClick={() =>
                                  router.push(`/@${c.profiles?.username || c.user_id}`)
                                }
                              >
                                @{c.profiles?.username || 'user'}
                              </p>
                              {editingCommentId === c.id ? (
                                <div className="mt-1 space-y-2">
                                  <input
                                    value={editCommentText}
                                    onChange={(e) => setEditCommentText(e.target.value)}
                                    className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-pink-500"
                                    autoFocus
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={saveEditComment}
                                      className="text-xs text-pink-400 font-medium"
                                    >
                                      Simpan
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingCommentId(null)
                                        setEditCommentText('')
                                      }}
                                      className="text-xs text-gray-500"
                                    >
                                      Batal
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm text-gray-300">
                                  {renderTextWithMentions(c.content, (uname) =>
                                    router.push(`/@${uname}`)
                                  )}
                                </p>
                              )}
                              <div className="flex items-center gap-3 mt-1 flex-wrap">
                                <span className="text-[11px] text-gray-500">
                                  {formatDateTime(c.created_at)}
                                </span>
                                <button
                                  onClick={() => {
                                    setReplyTo(c)
                                    setEditingCommentId(null)
                                    setNewComment('')
                                  }}
                                  className="text-[11px] text-pink-400 font-medium"
                                >
                                  Balas
                                </button>
                                <button
                                  onClick={() => toggleCommentLike(c.id)}
                                  className="flex items-center gap-1 text-[11px]"
                                >
                                  <span
                                    className={
                                      likedComments.has(c.id) ? 'text-red-500' : 'text-gray-500'
                                    }
                                  >
                                    {likedComments.has(c.id) ? '♥' : '♡'}
                                  </span>
                                  {(c.likes_count || 0) > 0 && (
                                    <span className="text-gray-500">{c.likes_count}</span>
                                  )}
                                </button>
                                {isOwn && editingCommentId !== c.id && (
                                  <>
                                    {canEditComment(c.created_at) && (
                                      <button
                                        onClick={() => startEditComment(c)}
                                        className="text-[11px] text-gray-400"
                                      >
                                        Edit
                                      </button>
                                    )}
                                    <button
                                      onClick={() => deleteComment(c)}
                                      className="text-[11px] text-red-400"
                                    >
                                      Hapus
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          {replies.length > 0 && (
                            <div className="ml-11 space-y-2 border-l border-white/10 pl-3">
                              {replies.map((r) => {
                                const isOwnReply = r.user_id === userId
                                return (
                                  <div key={r.id} className="flex gap-2">
                                    <div className="w-7 h-7 rounded-full overflow-hidden bg-zinc-700 shrink-0">
                                      {r.profiles?.avatar_url ? (
                                        <img
                                          src={r.profiles.avatar_url}
                                          alt=""
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[10px] font-bold bg-vezao-gradient">
                                          {r.profiles?.username?.[0]?.toUpperCase() || 'U'}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold">
                                        @{r.profiles?.username || 'user'}
                                      </p>
                                      {editingCommentId === r.id ? (
                                        <div className="mt-1 space-y-1">
                                          <input
                                            value={editCommentText}
                                            onChange={(e) => setEditCommentText(e.target.value)}
                                            className="w-full bg-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
                                            autoFocus
                                          />
                                          <div className="flex gap-2">
                                            <button
                                              onClick={saveEditComment}
                                              className="text-[10px] text-pink-400"
                                            >
                                              Simpan
                                            </button>
                                            <button
                                              onClick={() => setEditingCommentId(null)}
                                              className="text-[10px] text-gray-500"
                                            >
                                              Batal
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <p className="text-xs text-gray-300">
                                          {renderTextWithMentions(r.content, (uname) =>
                                            router.push(`/@${uname}`)
                                          )}
                                        </p>
                                      )}
                                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                        <span className="text-[10px] text-gray-500">
                                          {formatDateTime(r.created_at)}
                                        </span>
                                        <button
                                          onClick={() => toggleCommentLike(r.id)}
                                          className="flex items-center gap-0.5 text-[10px]"
                                        >
                                          <span
                                            className={
                                              likedComments.has(r.id)
                                                ? 'text-red-500'
                                                : 'text-gray-500'
                                            }
                                          >
                                            {likedComments.has(r.id) ? '♥' : '♡'}
                                          </span>
                                        </button>
                                        {isOwnReply && editingCommentId !== r.id && (
                                          <>
                                            {canEditComment(r.created_at) && (
                                              <button
                                                onClick={() => startEditComment(r)}
                                                className="text-[10px] text-gray-400"
                                              >
                                                Edit
                                              </button>
                                            )}
                                            <button
                                              onClick={() => deleteComment(r)}
                                              className="text-[10px] text-red-400"
                                            >
                                              Hapus
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })
                )}
              </div>
              <div className="p-3 border-t border-white/10 space-y-2">
                {replyTo && (
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs text-gray-400">
                      Membalas{' '}
                      <span className="text-pink-400">
                        @{replyTo.profiles?.username || 'user'}
                      </span>
                    </p>
                    <button onClick={() => setReplyTo(null)} className="text-xs text-gray-500">
                      Batal
                    </button>
                  </div>
                )}
                <div className="space-y-2">
                  {showMentions && (
                    <div className="rounded-xl border border-white/10 bg-zinc-800 overflow-hidden max-h-40 overflow-y-auto">
                      {mentionLoading ? (
                        <p className="text-xs text-gray-500 px-3 py-2">Mencari...</p>
                      ) : mentionResults.length === 0 ? (
                        <p className="text-xs text-gray-500 px-3 py-2">
                          Tidak ada teman yang cocok
                        </p>
                      ) : (
                        mentionResults.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => insertMention(u.username || '')}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left"
                          >
                            <div className="w-7 h-7 rounded-full overflow-hidden bg-zinc-700 shrink-0">
                              {u.avatar_url ? (
                                <img
                                  src={u.avatar_url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] font-bold bg-vezao-gradient">
                                  {(u.username || 'U')[0]?.toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">
                                {u.full_name || u.username}
                              </p>
                              <p className="text-[11px] text-gray-400 truncate">
                                @{u.username}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={newComment}
                      onChange={(e) => {
                        const val = e.target.value
                        setNewComment(val)
                        const upToCursor = val.slice(
                          0,
                          e.target.selectionStart || val.length
                        )
                        const match = upToCursor.match(/@([a-zA-Z0-9._]*)$/)
                        if (match) {
                          setShowMentions(true)
                          void searchMentions(match[1] || '')
                        } else {
                          setShowMentions(false)
                        }
                      }}
                      placeholder={
                        replyTo
                          ? `Balas @${replyTo.profiles?.username || 'user'}...`
                          : 'Tulis komentar... @teman'
                      }
                      className="flex-1 bg-zinc-800 rounded-full px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                      onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                    />
                    <button
                      onClick={submitComment}
                      className="bg-vezao-gradient px-5 py-2.5 rounded-full text-sm font-medium"
                    >
                      Kirim
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {showMore && (
          <div className="fixed inset-0 z-[70] flex items-end">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowMore(null)} />
                        <div className="relative w-full max-w-[480px] mx-auto bg-zinc-900 rounded-t-2xl p-4 pb-8">
              <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-4" />
              <div className="space-y-1">
                <button
                  onClick={() => {
                    const next = !autoScroll
                    setAutoScroll(next)
                    try {
                      localStorage.setItem('serulo_auto_scroll', next ? '1' : '0')
                    } catch {}
                    setShowMore(null)
                    queueMicrotask(() => {
                      toast(next ? 'Gulir otomatis ON' : 'Gulir otomatis OFF', 'success')
                    })
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl active:bg-white/5 text-left"
                >
                  <span className="text-lg w-7 text-center">{autoScroll ? '⏬' : '⏸️'}</span>
                  <span className="text-sm">
                    Gulir otomatis · {autoScroll ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button
                  onClick={async () => {
                    const url = `${window.location.origin}/v/${showMore}`
                    try {
                      await navigator.clipboard.writeText(url)
                      toast('Tautan disalin!', 'success')
                    } catch {
                      prompt('Salin tautan:', url)
                    }
                    setShowMore(null)
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl active:bg-white/5 text-left"
                >
                  <span className="text-lg w-7 text-center">🔗</span>
                  <span className="text-sm">Salin tautan</span>
                </button>

                {allVideos.find((v) => v.id === showMore)?.user_id === userId ? (
                  <>
                    <button
                      onClick={() => {
                        setShowMore(null)
                        router.push(`/upload?draft=${showMore}`)
                      }}
                      className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl active:bg-white/5 text-left"
                    >
                      <span className="text-lg w-7 text-center">✏️</span>
                      <span className="text-sm">Edit</span>
                    </button>
                    <button
                      onClick={() => handleDeleteVideo(showMore)}
                      className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl active:bg-white/5 text-left"
                    >
                      <span className="text-lg w-7 text-center">🗑️</span>
                      <span className="text-sm text-red-400">Hapus</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={async () => {
                        if (!userId || !showMore) return
                        await supabase.from('video_not_interested').upsert({
                          user_id: userId,
                          video_id: showMore,
                        })
                        notInterestedRef.current.add(showMore)
                        setAllVideos((prev) => prev.filter((v) => v.id !== showMore))
                        setShowMore(null)
                      }}
                      className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl active:bg-white/5 text-left"
                    >
                      <span className="text-lg w-7 text-center">👎</span>
                      <span className="text-sm">Tidak tertarik</span>
                    </button>
                    <button
                      onClick={() => {
                        setReportVideoId(showMore)
                        setShowMore(null)
                      }}
                      className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl active:bg-white/5 text-left"
                    >
                      <span className="text-lg w-7 text-center">🚩</span>
                      <span className="text-sm text-orange-400">Report</span>
                    </button>
                  </>
                )}

                <button
                  onClick={() => setShowMore(null)}
                  className="w-full py-3 text-sm text-gray-400 mt-1"
                >
                  Tutup
                </button>
              </div>
            </div>
            </div>
        )}

        {reportVideoId && (
          <div className="fixed inset-0 z-[80] flex items-end">
            <div className="absolute inset-0 bg-black/60" onClick={() => setReportVideoId(null)} />
            <div className="relative w-full bg-zinc-900 rounded-t-2xl p-4 pb-8">
              <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-4" />
              <h3 className="text-center font-semibold mb-4">Laporkan video</h3>
              <div className="space-y-1">
                {REPORT_REASONS.map((reason) => (
                  <button
                    key={reason}
                    onClick={() => submitReport(reason)}
                    className="w-full text-left px-4 py-3 rounded-xl text-sm hover:bg-white/5"
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setReportVideoId(null)}
                className="w-full mt-3 py-3 text-sm text-gray-400"
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {shareVideoId && (
          <div className="fixed inset-0 z-[80] flex items-end">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShareVideoId(null)} />
            <div className="relative w-full bg-zinc-900 rounded-t-2xl p-4 pb-8 max-h-[75vh] flex flex-col">
              <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-3" />
              <h3 className="text-center font-semibold mb-1">Kirim video</h3>
              <p className="text-center text-xs text-gray-400 mb-4">
                Ke teman SERULO atau app lain
              </p>
              <button
                onClick={shareToOtherApps}
                className="w-full flex items-center gap-3 px-3 py-3 mb-4 rounded-xl bg-zinc-800"
              >
                <div className="w-10 h-10 rounded-full bg-vezao-gradient flex items-center justify-center">
                  ↗
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold">Bagikan ke app lain</p>
                  <p className="text-xs text-gray-400">WhatsApp, Instagram, dll</p>
                </div>
              </button>
              <p className="text-xs text-gray-400 mb-2">Teman yang kamu follow</p>
              <div className="flex-1 overflow-y-auto space-y-1 min-h-[120px]">
                {loadingShareFriends ? (
                  <p className="text-center text-gray-500 py-6 text-sm">Loading...</p>
                ) : shareFriends.length === 0 ? (
                  <p className="text-center text-gray-500 py-6 text-sm">Belum follow siapapun</p>
                ) : (
                  shareFriends.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => shareVideoToFriend(f.id)}
                      disabled={sharingTo === f.id}
                      className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-white/5 disabled:opacity-50"
                    >
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-700 shrink-0">
                        {f.avatar_url ? (
                          <img
                            src={f.avatar_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm font-bold bg-vezao-gradient">
                            {(f.username || 'U')[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {f.full_name || f.username}
                        </p>
                        <p className="text-xs text-gray-400 truncate">@{f.username}</p>
                      </div>
                      <span className="text-xs text-pink-400">
                        {sharingTo === f.id ? '...' : 'Kirim'}
                      </span>
                    </button>
                  ))
                )}
              </div>
              <button
                onClick={() => setShareVideoId(null)}
                className="w-full mt-3 py-3 text-sm text-gray-400"
              >
                Batal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}