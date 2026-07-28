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
  const [newComment, setNewComment] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [feedTab, setFeedTab] = useState<'foryou' | 'following'>('foryou')
  const [inboxUnread, setInboxUnread] = useState(0)
  const [heartAnim, setHeartAnim] = useState<string | null>(null)
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set())
  const [showMore, setShowMore] = useState<string | null>(null)
  const [reportVideoId, setReportVideoId] = useState<string | null>(null)
  const [shareVideoId, setShareVideoId] = useState<string | null>(null)
  const [shareFriends, setShareFriends] = useState<
    { id: string; username: string | null; full_name: string | null; avatar_url: string | null }[]
  >([])
  const [loadingShareFriends, setLoadingShareFriends] = useState(false)
  const [sharingTo, setSharingTo] = useState<string | null>(null)
  const [pullDistance, setPullDistance] = useState(0)

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
    // Blokir 2 arah
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
        id,
        caption,
        video_url,
        likes_count,
        comments_count,
        comments_enabled,
        visibility,
        views_count,
        created_at,
        user_id,
        profiles (
          username,
          full_name,
          avatar_url,
          is_private
        )
      `)
      .eq('is_draft', false)
      .order('created_at', { ascending: false })

    const filtered = (videosData || []).filter((v: any) => {
      // Sembunyikan konten user yang diblokir (2 arah)
      if (blockedSet.has(v.user_id)) return false

      const vis = String(v.visibility ?? 'public')
        .toLowerCase()
        .replace(/['"]/g, '')
        .trim()

      if (vis === 'private') return false

      const isOwn = v.user_id === uid
      if (isOwn) return true

      const isPrivateAccount = v.profiles?.is_private === true
      const isFollower = followingSet.has(v.user_id)
      if (isPrivateAccount && !isFollower) return false
      if (vis === 'followers' && !isFollower) return false

      return true
    })

    const ranked = [...filtered].sort((a: any, b: any) => {
      const score = (v: any) => {
        const likes = v.likes_count || 0
        const ageHours =
          (Date.now() - new Date(v.created_at).getTime()) / (1000 * 60 * 60)
        const recencyBoost = Math.max(0, 48 - ageHours) * 0.5
        return likes * 2 + recencyBoost
      }
      return score(b) - score(a)
    })

    setAllVideos(ranked as any)

    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', uid)
      .eq('is_read', false)

    setInboxUnread(count || 0)

    const { data: likesData } = await supabase
      .from('likes')
      .select('video_id')
      .eq('user_id', uid)

    if (likesData) {
      setLikedVideos(new Set(likesData.map((l) => l.video_id)))
    }

    const { data: savesData } = await supabase
      .from('saves')
      .select('video_id')
      .eq('user_id', uid)

    if (savesData) {
      setSavedVideos(new Set(savesData.map((s) => s.video_id)))
    }
  }

  const registerView = async (videoId: string) => {
    if (viewedIdsRef.current.has(videoId)) return
    viewedIdsRef.current.add(videoId)

    const { error } = await supabase.rpc('increment_views', { video_id: videoId })
    if (error) {
      // fallback kalau RPC belum ada
      const video = allVideos.find((v) => v.id === videoId)
      const next = (video?.views_count || 0) + 1
      await supabase.from('videos').update({ views_count: next }).eq('id', videoId)
    }

    setAllVideos((prev) =>
      prev.map((v) =>
        v.id === videoId
          ? { ...v, views_count: (v.views_count || 0) + 1 }
          : v
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

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target as HTMLVideoElement
          if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
            video.muted = isMuted
            video.play().catch(() => {})
            const vid = video.dataset.videoId
            if (vid) registerView(vid)
          } else {
            video.pause()
          }
        })
      },
      { threshold: [0.7] }
    )

    videoRefs.current.forEach((video) => {
      if (video) observer.observe(video)
    })

    return () => observer.disconnect()
  }, [videos, isMuted, feedTab])

  useEffect(() => {
    if (videos.length === 0) return
    const timer = setTimeout(() => {
      const firstVideo = videoRefs.current[0]
      if (firstVideo) {
        firstVideo.muted = isMuted
        firstVideo.play().catch(() => {})
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [videos, feedTab])

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
      await supabase
        .from('saves')
        .delete()
        .eq('user_id', userId)
        .eq('video_id', videoId)
      setSavedVideos((prev) => {
        const next = new Set(prev)
        next.delete(videoId)
        return next
      })
    } else {
      const { error } = await supabase.from('saves').insert({
        user_id: userId,
        video_id: videoId,
      })
      if (error) {
        alert('Gagal simpan: ' + error.message)
        return
      }
      setSavedVideos((prev) => new Set(prev).add(videoId))

      const video = allVideos.find((v) => v.id === videoId)
      if (video && video.user_id !== userId) {
        await supabase.from('notifications').insert({
          user_id: video.user_id,
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
      const { error } = await supabase.from('follows').insert({
        follower_id: userId,
        following_id: targetUserId,
      })
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

    const { data } = await supabase
      .from('comments')
      .select(`
        id,
        content,
        created_at,
        user_id,
        parent_id,
        profiles ( username, avatar_url )
      `)
      .eq('video_id', videoId)
      .order('created_at', { ascending: true })

    if (data) setComments(data as any)
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

    // Hitung komentar utama saja (bukan reply) ke comments_count
    if (!parentId) {
      await supabase.rpc('increment_comments', { video_id: activeVideoId })
      setAllVideos((prev) =>
        prev.map((v) =>
          v.id === activeVideoId
            ? { ...v, comments_count: (v.comments_count || 0) + 1 }
            : v
        )
      )
    }

    setNewComment('')
    setReplyTo(null)

    const video = allVideos.find((v) => v.id === activeVideoId)

    if (parentId && replyTo && replyTo.user_id !== userId) {
      // Notif ke pemilik komentar yang dibalas
      await supabase.from('notifications').insert({
        user_id: replyTo.user_id,
        actor_id: userId,
        type: 'comment',
        video_id: activeVideoId,
        message: content,
        is_read: false,
      })
    } else if (!parentId && video && video.user_id !== userId) {
      // Notif ke pemilik video
      await supabase.from('notifications').insert({
        user_id: video.user_id,
        actor_id: userId,
        type: 'comment',
        video_id: activeVideoId,
        message: content,
        is_read: false,
      })
    }

    await openComments(activeVideoId)
  }

  const submitReport = async (reason: string) => {
    if (!userId || !reportVideoId) return
    const video = allVideos.find((v) => v.id === reportVideoId)

    const { error } = await supabase.from('reports').insert({
      reporter_id: userId,
      reported_user_id: video?.user_id || null,
      video_id: reportVideoId,
      reason,
    })

    if (error) alert('Gagal report: ' + error.message)
    else alert('Terima kasih. Laporan sudah dikirim.')

    setReportVideoId(null)
    setShowMore(null)
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
    alert('Video terkirim!')
    setShareVideoId(null)
  }

  const shareToOtherApps = async () => {
    if (!shareVideoId) return
    const url = `${window.location.origin}/v/${shareVideoId}`
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'VEZAO',
          text: 'Lihat video ini di VEZAO!',
          url,
        })
        setShareVideoId(null)
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url)
        alert('Tautan disalin (browser tidak support share sheet)')
      } catch {
        prompt('Salin tautan:', url)
      }
    }
  }

  if (loading) {
    return (
      <div className="h-[100dvh] bg-black relative overflow-hidden">
        <div className="absolute inset-0 bg-zinc-900 animate-pulse" />
        <div className="absolute bottom-28 left-4 right-20 space-y-3 z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-zinc-700 animate-pulse" />
            <div className="h-3 w-24 bg-zinc-700 rounded animate-pulse" />
            <div className="h-5 w-16 bg-zinc-700 rounded-full animate-pulse" />
          </div>
          <div className="h-3 w-48 bg-zinc-700 rounded animate-pulse" />
          <div className="h-3 w-32 bg-zinc-700 rounded animate-pulse" />
        </div>
        <div className="absolute right-3 bottom-32 flex flex-col items-center gap-5 z-10">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="w-11 h-11 rounded-full bg-zinc-700 animate-pulse" />
          ))}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-zinc-950 border-t border-white/5" />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-[100dvh] bg-black overflow-y-scroll snap-y snap-mandatory pb-16 md:bg-zinc-950"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {(pullDistance > 0 || refreshing) && (
        <div
          className="fixed top-14 left-0 right-0 z-[45] flex justify-center pointer-events-none"
          style={{ transform: `translateY(${Math.min(pullDistance, 60)}px)` }}
        >
          <div className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/20">
            {refreshing ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`w-4 h-4 text-white transition-transform ${pullDistance > 50 ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            )}
          </div>
        </div>
      )}

      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center px-4 h-12 pointer-events-none">
        <div className="w-full md:w-[420px] flex items-center justify-between px-4 h-12 bg-gradient-to-b from-black/70 to-transparent pointer-events-auto">
        <div className="flex items-center gap-5">
          <button
            onClick={() => setFeedTab('following')}
            className={`relative text-[15px] font-semibold pb-1 ${
              feedTab === 'following' ? 'text-white' : 'text-white/50'
            }`}
          >
            Following
            {feedTab === 'following' && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-white rounded-full" />
            )}
          </button>
          <button
            onClick={() => setFeedTab('foryou')}
            className={`relative text-[15px] font-semibold pb-1 ${
              feedTab === 'foryou' ? 'text-white' : 'text-white/50'
            }`}
          >
            For You
            {feedTab === 'foryou' && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-white rounded-full" />
            )}
          </button>
        </div>

        <button onClick={() => setIsMuted(!isMuted)}>
          <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
            {isMuted ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </div>
        </button>
        </div>
      </div>

      {videos.length === 0 ? (
        <div className="h-screen flex flex-col items-center justify-center text-gray-400 gap-4 px-8 text-center">
          <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-3xl">
            {feedTab === 'following' ? '👥' : '🎬'}
          </div>
          <div>
            <p className="text-white font-semibold mb-1">
              {feedTab === 'following' ? 'Belum ada konten' : 'Belum ada video'}
            </p>
            <p className="text-sm text-gray-500">
              {feedTab === 'following'
                ? 'Follow creator biar videonya muncul di sini'
                : 'Jadi yang pertama upload di Vezao'}
            </p>
          </div>
          {feedTab === 'following' ? (
            <button
              onClick={() => setFeedTab('foryou')}
              className="bg-vezao-gradient text-white px-6 py-2.5 rounded-full text-sm font-medium"
            >
              Lihat For You
            </button>
          ) : (
            <button
              onClick={() => router.push('/upload')}
              className="bg-vezao-gradient text-white px-6 py-2.5 rounded-full text-sm font-medium"
            >
              Upload Video
            </button>
          )}
        </div>
      ) : (
        videos.map((video, index) => {
          const isLiked = likedVideos.has(video.id)
          const isFollowing = following.has(video.user_id)
          const isOwnVideo = video.user_id === userId

          return (
            <div
              key={video.id}
              className="h-[100dvh] w-full snap-start relative flex items-center justify-center md:bg-zinc-950"
            >
              {/* Kolom video (mobile full, desktop portrait di tengah) */}
              <div className="relative h-full w-full md:w-[420px] md:max-w-[420px] md:h-[100dvh] md:rounded-none md:shadow-2xl md:overflow-hidden bg-black">
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
                preload="auto"
                onClick={(e) => handleVideoTap(video.id, e.currentTarget)}
              />

              {heartAnim === video.id && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-28 h-28 text-white drop-shadow-2xl animate-ping"
                    style={{ animationDuration: '0.6s' }}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                </div>
              )}

              <div className="absolute bottom-0 left-0 right-0 h-52 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />

              <div className="absolute bottom-28 left-4 right-20 text-white z-10 pb-safe">
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    onClick={() => router.push(`/@${video.profiles?.username || video.user_id}`)}
                    className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700 shrink-0 border border-white/20 cursor-pointer"
                  >
                    {video.profiles?.avatar_url ? (
                      <img src={video.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold bg-vezao-gradient">
                        {video.profiles?.username?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>

                  <p
                    onClick={() => router.push(`/@${video.profiles?.username || video.user_id}`)}
                    className="font-semibold text-sm cursor-pointer"
                  >
                    @{video.profiles?.username || 'user'}
                  </p>

                  {!isOwnVideo && (
                    <button
                      onClick={() => toggleFollow(video.user_id)}
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium transition ${
                        isFollowing ? 'bg-white/20 text-white' : 'bg-vezao-gradient text-white'
                      }`}
                    >
                      {isFollowing ? 'Following' : 'Follow'}
                    </button>
                  )}
                </div>
                <p className="text-sm opacity-90 line-clamp-3">
                  {(video.caption || '').split(/(#\w+)/g).map((part, i) =>
                    part.startsWith('#') ? (
                      <span
                        key={i}
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/hashtag?tag=${part.slice(1)}`)
                        }}
                        className="text-blue-400 font-medium cursor-pointer"
                      >
                        {part}
                      </span>
                    ) : (
                      <span key={i}>{part}</span>
                    )
                  )}
                </p>
                <p className="text-[11px] text-white/50 mt-1">
                  {formatDateTime(video.created_at)}
                </p>
              </div>

              <div className="absolute right-3 bottom-36 flex flex-col items-center gap-5 z-10">
                <button onClick={() => toggleLike(video.id)} className="flex flex-col items-center">
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center border border-white/10 ${
                      isLiked ? 'bg-red-500' : 'bg-black/40 backdrop-blur-md'
                    }`}
                  >
                    {isLiked ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs mt-1 text-white font-medium">{video.likes_count}</span>
                </button>

                <button
                  onClick={() => {
                    if (video.comments_enabled === false) {
                      alert('Komentar dimatikan untuk video ini')
                      return
                    }
                    openComments(video.id)
                  }}
                  className="flex flex-col items-center"
                >
                  <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <span className="text-xs mt-1 text-white font-medium">{video.comments_count || 0}</span>
                </button>

                <button
                  onClick={() => toggleSave(video.id)}
                  className="flex flex-col items-center"
                >
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center border border-white/10 ${
                      savedVideos.has(video.id)
                        ? 'bg-yellow-500'
                        : 'bg-black/40 backdrop-blur-md'
                    }`}
                  >
                    {savedVideos.has(video.id) ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs mt-1 text-white font-medium">Save</span>
                </button>

                <button onClick={() => openShare(video.id)} className="flex flex-col items-center">
                  <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
                    </svg>
                  </div>
                  <span className="text-xs mt-1 text-white font-medium">Share</span>
                </button>

                <button onClick={() => setShowMore(video.id)} className="flex flex-col items-center">
                  <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="6" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="18" r="1.5" />
                    </svg>
                  </div>
                </button>
              </div>
              </div>{/* tutup kolom video desktop */}
            </div>
          )
        })
      )}

      <BottomNav />

      {showComments && (
        <div className="fixed inset-0 z-[60] flex items-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowComments(false)} />
          <div className="relative w-full bg-zinc-900 rounded-t-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="font-semibold">Comments</h3>
              <button onClick={() => setShowComments(false)} className="text-gray-400 text-lg">
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
                            <p className="text-sm font-semibold">
                              @{c.profiles?.username || 'user'}
                            </p>
                            <p className="text-sm text-gray-300">{c.content}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[11px] text-gray-500">
                                {formatDateTime(c.created_at)}
                              </span>
                              <button
                                onClick={() => {
                                  setReplyTo(c)
                                  setNewComment('')
                                }}
                                className="text-[11px] text-purple-400 font-medium"
                              >
                                Balas
                              </button>
                            </div>
                          </div>
                        </div>

                        {replies.length > 0 && (
                          <div className="ml-11 space-y-2 border-l border-white/10 pl-3">
                            {replies.map((r) => (
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
                                  <p className="text-xs text-gray-300">{r.content}</p>
                                  <span className="text-[10px] text-gray-500">
                                    {formatDateTime(r.created_at)}
                                  </span>
                                </div>
                              </div>
                            ))}
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
                  <button
                    onClick={() => setReplyTo(null)}
                    className="text-xs text-gray-500"
                  >
                    Batal
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={
                    replyTo
                      ? `Balas @${replyTo.profiles?.username || 'user'}...`
                      : 'Tulis komentar...'
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
      )}

      {showMore && (
        <div className="fixed inset-0 z-[70] flex items-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowMore(null)} />
          <div className="relative w-full bg-zinc-900 rounded-t-2xl p-4 pb-10">
            <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-6" />
            <div className="grid grid-cols-4 gap-4 text-center">
              {(() => {
                const video = allVideos.find((v) => v.id === showMore)
                const isOwn = video?.user_id === userId

                return (
                  <>
                    <button
                      onClick={async () => {
                        if (!showMore) return
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
                      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <span className="text-xs">Salin tautan</span>
                    </button>

                    {!isOwn && (
                      <button
                        onClick={() => {
                          setReportVideoId(showMore)
                          setShowMore(null)
                        }}
                        className="flex flex-col items-center gap-1"
                      >
                        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                          </svg>
                        </div>
                        <span className="text-xs text-orange-400">Report</span>
                      </button>
                    )}

                    <button className="flex flex-col items-center gap-1" onClick={() => setShowMore(null)}>
                      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                      <span className="text-xs">Tutup</span>
                    </button>
                  </>
                )
              })()}
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
                  className="w-full text-left px-4 py-3 rounded-xl text-sm hover:bg-white/5 active:bg-white/10"
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
            <p className="text-center text-xs text-gray-400 mb-4">Ke teman VEZAO atau app lain</p>

            <button
              onClick={shareToOtherApps}
              className="w-full flex items-center gap-3 px-3 py-3 mb-4 rounded-xl bg-zinc-800 active:bg-zinc-700"
            >
              <div className="w-10 h-10 rounded-full bg-vezao-gradient flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">Bagikan ke app lain</p>
                <p className="text-xs text-gray-400">WhatsApp, Instagram, dll</p>
              </div>
            </button>

            <p className="text-xs text-gray-400 mb-2 px-1">Teman yang kamu follow</p>
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
                    className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-white/5 active:bg-white/10 disabled:opacity-50"
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-700 shrink-0">
                      {f.avatar_url ? (
                        <img src={f.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm font-bold bg-vezao-gradient">
                          {(f.username || 'U')[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-semibold truncate">{f.full_name || f.username}</p>
                      <p className="text-xs text-gray-400 truncate">@{f.username}</p>
                    </div>
                    <span className="text-xs text-purple-400 shrink-0">
                      {sharingTo === f.id ? '...' : 'Kirim'}
                    </span>
                  </button>
                ))
              )}
            </div>

            <button onClick={() => setShareVideoId(null)} className="w-full mt-3 py-3 text-sm text-gray-400">
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  )
}