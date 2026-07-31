'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

type Video = {
  id: string
  caption: string | null
  comments_enabled?: boolean | null
  video_url: string
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
  await supabase.from('notifications').insert(rows)
}

export default function FeedPage() {
  const [allVideos, setAllVideos] = useState<Video[]>([])
  const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set())
  const [savedVideos, setSavedVideos] = useState<Set<string>>(new Set())
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(true)
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

  const router = useRouter()
  const supabase = createClient()
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([])
  const lastTapRef = useRef<{ time: number; videoId: string } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const startYRef = useRef(0)
  const isPullingRef = useRef(false)
  const viewedIdsRef = useRef<Set<string>>(new Set())

  const videos =
    feedTab === 'foryou'
      ? allVideos.filter((v) => !blockedUsers.has(v.user_id))
      : allVideos.filter((v) => following.has(v.user_id) && !blockedUsers.has(v.user_id))

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

    const { data: followData } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', uid)
    const followingSet = new Set(followData?.map((f) => f.following_id) || [])
    setFollowing(followingSet)

    const { data: videosData } = await supabase
      .from('videos')
      .select(`
        id, caption, video_url, likes_count, comments_count, comments_enabled,
        saves_count, shares_count, visibility, views_count, sound_name, created_at, user_id,
        profiles ( username, full_name, avatar_url, is_private )
      `)
      .eq('is_draft', false)
      .order('created_at', { ascending: false })

    const filtered = (videosData || []).filter((v: any) => {
      if (blockedSet.has(v.user_id)) return false
      const vis = String(v.visibility ?? 'public').toLowerCase().replace(/['"]/g, '').trim()
      if (vis === 'private') return false
      if (v.user_id === uid) return true
      const isPrivateAccount = v.profiles?.is_private === true
      const isFollower = followingSet.has(v.user_id)
      if (isPrivateAccount && !isFollower) return false
      if (vis === 'followers' && !isFollower) return false
      return true
    })

    const scoreVideo = (v: any, isFollower: boolean) => {
      const likes = v.likes_count || 0
      const comments = v.comments_count || 0
      const saves = v.saves_count || 0
      const shares = v.shares_count || 0
      const views = v.views_count || 0
      const engagement =
        likes * 3 + comments * 4 + saves * 5 + shares * 6 + Math.log10(views + 1) * 2
      const ageHours =
        (Date.now() - new Date(v.created_at).getTime()) / (1000 * 60 * 60)
      const freshness = Math.max(0, 72 - ageHours) * 0.8
      const followBoost = isFollower ? 8 : 0
      const jitter = Math.random() * 40
      return engagement + freshness + followBoost + jitter
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
    setAllVideos((prev) =>
      prev.map((v) =>
        v.id === videoId ? { ...v, views_count: (v.views_count || 0) + 1 } : v
      )
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
  }, [feedTab])

  useEffect(() => {
    if (videos.length === 0) return

    const pauseAllExcept = (active: HTMLVideoElement | null) => {
      videoRefs.current.forEach((v) => {
        if (!v || v === active) return
        v.pause()
      })
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
          el.muted = isMuted
          el.play().catch(() => {
            el.muted = true
            el.play().catch(() => {})
          })
          const vid = el.dataset.videoId
          if (vid) registerView(vid)
        }
      },
      { threshold: [0.25, 0.55, 0.7, 0.9] }
    )

    const t = setTimeout(() => {
      videoRefs.current.forEach((video) => {
        if (video) observer.observe(video)
      })
      const first = videoRefs.current[0]
      if (first) {
        pauseAllExcept(first)
        first.muted = isMuted
        first.play().catch(() => {
          first.muted = true
          first.play().catch(() => {})
        })
        const vid = first.dataset.videoId
        if (vid) registerView(vid)
      }
    }, 150)

    return () => {
      clearTimeout(t)
      observer.disconnect()
    }
  }, [videos, isMuted, feedTab])

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
        await supabase.from('notifications').insert({
          user_id: video.user_id,
          actor_id: userId,
          type: 'like',
          video_id: videoId,
          message: null,
          is_read: false,
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
        alert('Gagal simpan: ' + error.message)
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
        await supabase.from('notifications').insert({
          user_id: owner.user_id,
          actor_id: userId,
          type: 'save',
          video_id: videoId,
          message: null,
          is_read: false,
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
    } else {
      lastTapRef.current = { time: now, videoId }
      if (videoEl.paused) videoEl.play().catch(() => {})
      else videoEl.pause()
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
      await supabase.from('notifications').insert({
        user_id: targetUserId,
        actor_id: userId,
        type: 'follow',
        video_id: null,
        message: null,
        is_read: false,
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
      alert('Gagal kirim komentar: ' + error.message)
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
      await supabase.from('notifications').insert({
        user_id: replyTo.user_id,
        actor_id: userId,
        type: 'comment',
        video_id: activeVideoId,
        message: content,
        is_read: false,
      })
    } else if (!parentId && video && video.user_id !== userId) {
      await supabase.from('notifications').insert({
        user_id: video.user_id,
        actor_id: userId,
        type: 'comment',
        video_id: activeVideoId,
        message: content,
        is_read: false,
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
      alert('Gagal edit: ' + error.message)
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
      alert('Gagal hapus: ' + error.message)
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
      alert('Gagal hapus: ' + error.message)
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
      alert('Gagal kirim video: ' + error.message)
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
      await supabase.from('notifications').insert({
        user_id: owner.user_id,
        actor_id: userId,
        type: 'share',
        video_id: shareVideoId,
        message: null,
        is_read: false,
      })
    }

    alert('Video terkirim!')
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
        await supabase.from('notifications').insert({
          user_id: owner.user_id,
          actor_id: userId,
          type: 'share',
          video_id: shareVideoId,
          message: null,
          is_read: false,
        })
      }
    }

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'VEZAO', text: 'Lihat video ini di VEZAO!', url })
        await bumpShare()
        setShareVideoId(null)
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url)
        alert('Tautan disalin')
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
      alert('Video tidak ditemukan')
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
      alert('Gagal report: ' + error.message)
      return
    }
    alert('Laporan terkirim. Terima kasih.')
    setReportVideoId(null)
  }

  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center md:bg-zinc-950">
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="h-screen w-full bg-black">
      <div className="h-screen w-full max-w-[480px] mx-auto bg-black text-white overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-center gap-6 pt-3 pb-2 pointer-events-none">
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

        <button
          onClick={() => setIsMuted(!isMuted)}
          className="absolute top-3 right-3 z-40 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10"
        >
          {isMuted ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          )}
        </button>

        <div
          ref={containerRef}
          className="h-[100dvh] overflow-y-scroll snap-y snap-mandatory pb-16"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ paddingTop: pullDistance > 0 ? pullDistance : 0 }}
        >
          {refreshing && (
            <div className="text-center text-xs text-white/70 py-2">Refresh...</div>
          )}

          {videos.length === 0 ? (
            <div className="h-screen flex items-center justify-center text-gray-400 text-sm">
              {feedTab === 'following' ? 'Follow seseorang untuk lihat video' : 'Belum ada video'}
            </div>
          ) : (
            videos.map((video, index) => (
              <div
                key={video.id}
                className="h-[100dvh] w-full snap-start relative flex items-center justify-center"
              >
                <video
                  ref={(el) => {
                    videoRefs.current[index] = el
                  }}
                  data-video-id={video.id}
                  src={video.video_url}
                  className="absolute inset-0 w-full h-full object-cover"
                  loop
                  muted={isMuted}
                  playsInline
                  preload={index < 2 ? 'auto' : 'metadata'}
                  onClick={(e) => handleVideoTap(video.id, e.currentTarget)}
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget
                    if (!v.duration || !isFinite(v.duration)) return
                    const pct = Math.min(100, (v.currentTime / v.duration) * 100)
                    setProgressMap((prev) => {
                      if (Math.abs((prev[video.id] || 0) - pct) < 0.4) return prev
                      return { ...prev, [video.id]: pct }
                    })
                  }}
                  onEnded={() => {
                    setProgressMap((prev) => ({ ...prev, [video.id]: 0 }))
                  }}
                />

                {/* Progress bar short */}
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
                <div className="absolute bottom-24 left-4 right-20 text-white z-10">
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
                  <p className="text-sm opacity-90 line-clamp-3">
                    {renderTextWithMentions(
                      video.caption || '',
                      (uname) => router.push(`/@${uname}`),
                      (tag) => router.push(`/hashtag?tag=${tag}`)
                    )}
                  </p>
                  <p
                    onClick={(e) => {
                      e.stopPropagation()
                      const name =
                        video.sound_name ||
                        `Original sound - @${video.profiles?.username || 'user'}`
                      router.push(`/sound?name=${encodeURIComponent(name)}`)
                    }}
                    className="text-[11px] text-white/70 mt-1 flex items-center gap-1 cursor-pointer max-w-[90%]"
                  >
                    <span>♪</span>
                    <span className="truncate">
                      {video.sound_name ||
                        `Original sound - @${video.profiles?.username || 'user'}`}
                    </span>
                  </p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {formatDateTime(video.created_at)}
                  </p>
                </div>

                <div className="absolute right-2 bottom-28 flex flex-col items-center gap-3 z-10">
                  <button onClick={() => toggleLike(video.id)} className="flex flex-col items-center">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center border border-white/10 ${
                        likedVideos.has(video.id) ? 'bg-red-500/90' : 'bg-black/40 backdrop-blur-md'
                      }`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-5 h-5 text-white"
                        viewBox="0 0 24 24"
                        fill={likedVideos.has(video.id) ? 'currentColor' : 'none'}
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
                    <span className="text-[10px] mt-0.5 text-white font-medium">
                      {video.likes_count}
                    </span>
                  </button>

                  <button
                    onClick={() => openComments(video.id)}
                    className="flex flex-col items-center"
                  >
                    <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-5 h-5 text-white"
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
                    <span className="text-[10px] mt-0.5 text-white font-medium">
                      {video.comments_count || 0}
                    </span>
                  </button>

                  <button onClick={() => toggleSave(video.id)} className="flex flex-col items-center">
                    <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`w-5 h-5 ${
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
                    <span className="text-[10px] mt-0.5 text-white font-medium">
                      {video.saves_count || 0}
                    </span>
                  </button>

                  <button onClick={() => openShare(video.id)} className="flex flex-col items-center">
                    <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-5 h-5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"
                        />
                      </svg>
                    </div>
                    <span className="text-[10px] mt-0.5 text-white font-medium">
                      {video.shares_count || 0}
                    </span>
                  </button>

                  <button onClick={() => setShowMore(video.id)}>
                    <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                      <span className="text-base leading-none">⋯</span>
                    </div>
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
                                    className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                                    autoFocus
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={saveEditComment}
                                      className="text-xs text-purple-400 font-medium"
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
                                  className="text-[11px] text-purple-400 font-medium"
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
                                              className="text-[10px] text-purple-400"
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
                      <span className="text-purple-400">
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
                      className="flex-1 bg-zinc-800 rounded-full px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
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
            <div className="relative w-full bg-zinc-900 rounded-t-2xl p-4 pb-10">
              <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-6" />
              <div className="grid grid-cols-4 gap-4 text-center">
                <button
                  onClick={async () => {
                    const url = `${window.location.origin}/v/${showMore}`
                    try {
                      await navigator.clipboard.writeText(url)
                      alert('Tautan disalin!')
                    } catch {
                      prompt('Salin tautan:', url)
                    }
                    setShowMore(null)
                  }}
                  className="flex flex-col items-center gap-1"
                >
                  <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg">
                    🔗
                  </div>
                  <span className="text-xs">Salin tautan</span>
                </button>

                {allVideos.find((v) => v.id === showMore)?.user_id === userId ? (
                  <>
                    <button
                      onClick={() => {
                        setShowMore(null)
                        router.push(`/upload?draft=${showMore}`)
                      }}
                      className="flex flex-col items-center gap-1"
                    >
                      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg">
                        ✏️
                      </div>
                      <span className="text-xs">Edit</span>
                    </button>
                    <button
                      onClick={() => handleDeleteVideo(showMore)}
                      className="flex flex-col items-center gap-1"
                    >
                      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg">
                        🗑️
                      </div>
                      <span className="text-xs text-red-400">Hapus</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setReportVideoId(showMore)
                      setShowMore(null)
                    }}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg">
                      🚩
                    </div>
                    <span className="text-xs text-orange-400">Report</span>
                  </button>
                )}

                <button
                  onClick={() => setShowMore(null)}
                  className="flex flex-col items-center gap-1"
                >
                  <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg">
                    ✕
                  </div>
                  <span className="text-xs">Tutup</span>
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
                Ke teman VEZAO atau app lain
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
                      <span className="text-xs text-purple-400">
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