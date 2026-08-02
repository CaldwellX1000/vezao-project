'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { insertNotification } from '@/lib/notify'
import { toast } from '@/lib/toast'

type Video = {
  id: string
  caption: string | null
  video_url: string
  likes_count: number
  comments_count: number
  saves_count?: number | null
  shares_count?: number | null
  comments_enabled?: boolean | null
  visibility?: string | null
  is_pinned?: boolean | null
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

function UserVideosContent() {
  const searchParams = useSearchParams()
  const userId = searchParams.get('userId')
  const startId = searchParams.get('start')

  const [videos, setVideos] = useState<Video[]>([])
  const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set())
  const [savedVideos, setSavedVideos] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [isMuted, setIsMuted] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showMore, setShowMore] = useState<string | null>(null)
  const [showComments, setShowComments] = useState(false)
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set())
  const [newComment, setNewComment] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentText, setEditCommentText] = useState('')
  const [heartAnim, setHeartAnim] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([])
  const lastTapRef = useRef<{ time: number; videoId: string } | null>(null)
  const viewedIdsRef = useRef<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  const initialDoneRef = useRef(false)

  const registerView = async (videoId: string) => {
    if (viewedIdsRef.current.has(videoId)) return
    viewedIdsRef.current.add(videoId)
    try {
      await supabase.rpc('increment_views', { video_id: videoId })
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const load = async () => {
      if (!userId) {
        router.replace('/')
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setCurrentUserId(user.id)

      const { data: followCheck } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', userId)
        .maybeSingle()

      const isFollower = !!followCheck

      const { data } = await supabase
        .from('videos')
        .select(`
          id, caption, video_url, likes_count, comments_count, saves_count, shares_count,
          comments_enabled, visibility, is_pinned, created_at, user_id,
          profiles ( username, full_name, avatar_url )
        `)
        .eq('user_id', userId)
        .eq('is_draft', false)
        .order('created_at', { ascending: false })

      const filtered = (data || []).filter((v: any) => {
        if (v.user_id === user.id) return true
        const vis = v.visibility || 'public'
        if (vis === 'private') return false
        if (vis === 'followers') return isFollower
        return true
      })

      let list = [...filtered].sort((a: any, b: any) => {
        if (a.is_pinned && !b.is_pinned) return -1
        if (!a.is_pinned && b.is_pinned) return 1
        return 0
      }) as any[]

      if (startId) {
        const idx = list.findIndex((v) => v.id === startId)
        if (idx > 0) {
          const [picked] = list.splice(idx, 1)
          list = [picked, ...list]
        }
      }

      setVideos(list)

      const { data: likesData } = await supabase
        .from('likes')
        .select('video_id')
        .eq('user_id', user.id)
      if (likesData) setLikedVideos(new Set(likesData.map((l) => l.video_id)))

      const { data: savesData } = await supabase
        .from('saves')
        .select('video_id')
        .eq('user_id', user.id)
      if (savesData) setSavedVideos(new Set(savesData.map((s) => s.video_id)))

      setLoading(false)
    }

    load()
  }, [userId, startId])

  useEffect(() => {
    if (videos.length === 0) return

    initialDoneRef.current = false

    const timer = setTimeout(() => {
      let index = 0
      if (startId) {
        const found = videos.findIndex((v) => v.id === startId)
        if (found >= 0) index = found
      }

      // Pause semua
      videoRefs.current.forEach((v) => {
        if (v) {
          v.pause()
          try {
            v.currentTime = 0
          } catch {}
        }
      })

      const container = containerRef.current
      if (container) {
        // Tiap slide = 1 layar penuh
        container.scrollTop = index * window.innerHeight
      }

      const el = videoRefs.current[index]
      if (el) {
        el.muted = isMuted
        el.play().catch(() => {})
      }

      initialDoneRef.current = true
    }, 250)

    return () => clearTimeout(timer)
  }, [videos, startId])

  const toggleLike = async (videoId: string) => {
    if (!currentUserId) return
    const isLiked = likedVideos.has(videoId)
    if (isLiked) {
      await supabase.from('likes').delete().eq('user_id', currentUserId).eq('video_id', videoId)
      await supabase.rpc('decrement_likes', { video_id: videoId })
      setLikedVideos((prev) => {
        const next = new Set(prev)
        next.delete(videoId)
        return next
      })
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId ? { ...v, likes_count: Math.max(0, v.likes_count - 1) } : v
        )
      )
    } else {
      const { error } = await supabase
        .from('likes')
        .insert({ user_id: currentUserId, video_id: videoId })
      if (error) return
      await supabase.rpc('increment_likes', { video_id: videoId })
      setLikedVideos((prev) => new Set(prev).add(videoId))
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId ? { ...v, likes_count: v.likes_count + 1 } : v
        )
      )
      const video = videos.find((v) => v.id === videoId)
      if (video && video.user_id !== currentUserId) {
        await insertNotification(supabase, {
          user_id: video.user_id,
          actor_id: currentUserId,
          type: 'like',
          video_id: videoId,
        })
      }
    }
  }

  const toggleSave = async (videoId: string) => {
    if (!currentUserId) return
    const isSaved = savedVideos.has(videoId)
    if (isSaved) {
      await supabase
        .from('saves')
        .delete()
        .eq('user_id', currentUserId)
        .eq('video_id', videoId)
      await supabase.rpc('decrement_saves', { video_id: videoId })
      setSavedVideos((prev) => {
        const next = new Set(prev)
        next.delete(videoId)
        return next
      })
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId
            ? { ...v, saves_count: Math.max(0, (v.saves_count || 0) - 1) }
            : v
        )
      )
    } else {
      const { error } = await supabase
        .from('saves')
        .insert({ user_id: currentUserId, video_id: videoId })
      if (error) {
        toast('Gagal simpan: ' + error.message, 'error')
        return
      }
      await supabase.rpc('increment_saves', { video_id: videoId })
      setSavedVideos((prev) => new Set(prev).add(videoId))
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId
            ? { ...v, saves_count: (v.saves_count || 0) + 1 }
            : v
        )
      )
      const owner = videos.find((v) => v.id === videoId)
      if (owner && owner.user_id !== currentUserId) {
        await insertNotification(supabase, {
          user_id: owner.user_id,
          actor_id: currentUserId,
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
    } else {
      lastTapRef.current = { time: now, videoId }
      if (videoEl.paused) videoEl.play().catch(() => {})
      else videoEl.pause()
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

    if (currentUserId && data && data.length > 0) {
      const ids = data.map((c: any) => c.id)
      const { data: myLikes } = await supabase
        .from('comment_likes')
        .select('comment_id')
        .eq('user_id', currentUserId)
        .in('comment_id', ids)
      setLikedComments(new Set((myLikes || []).map((l) => l.comment_id)))
    } else {
      setLikedComments(new Set())
    }

    setLoadingComments(false)
  }

  const submitComment = async () => {
    if (!newComment.trim() || !currentUserId || !activeVideoId) return
    const content = newComment.trim()
    const parentId = replyTo?.id || null

    const { error } = await supabase.from('comments').insert({
      video_id: activeVideoId,
      user_id: currentUserId,
      content,
      parent_id: parentId,
    })
    if (error) {
      toast('Gagal kirim komentar: ' + error.message, 'error')
      return
    }

    await supabase.rpc('increment_comments', { video_id: activeVideoId })
    setVideos((prev) =>
      prev.map((v) =>
        v.id === activeVideoId
          ? { ...v, comments_count: (v.comments_count || 0) + 1 }
          : v
      )
    )

    setNewComment('')
    setReplyTo(null)

    const video = videos.find((v) => v.id === activeVideoId)
    if (parentId && replyTo && replyTo.user_id !== currentUserId) {
      await insertNotification(supabase, {
        user_id: replyTo.user_id,
        actor_id: currentUserId,
        type: 'comment',
        video_id: activeVideoId,
        message: content,
      })
    } else if (!parentId && video && video.user_id !== currentUserId) {
      await insertNotification(supabase, {
        user_id: video.user_id,
        actor_id: currentUserId,
        type: 'comment',
        video_id: activeVideoId,
        message: content,
      })
    }

    await openComments(activeVideoId)
  }

  const toggleCommentLike = async (commentId: string) => {
    if (!currentUserId) return
    const isLiked = likedComments.has(commentId)
    if (isLiked) {
      await supabase
        .from('comment_likes')
        .delete()
        .eq('user_id', currentUserId)
        .eq('comment_id', commentId)
      await supabase.rpc('decrement_comment_likes', { comment_id: commentId })
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
        .insert({ user_id: currentUserId, comment_id: commentId })
      if (error) return
      await supabase.rpc('increment_comment_likes', { comment_id: commentId })
      setLikedComments((prev) => new Set(prev).add(commentId))
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, likes_count: (c.likes_count || 0) + 1 }
            : c
        )
      )
    }
  }

  const startEditComment = (c: Comment) => {
    if (!canEditComment(c.created_at)) {
      toast('Komentar hanya bisa diedit dalam 30 menit', 'error')
      return
    }
    setEditingCommentId(c.id)
    setEditCommentText(c.content)
    setReplyTo(null)
  }

  const saveEditComment = async () => {
    if (!editingCommentId || !editCommentText.trim() || !currentUserId) return
    const { error } = await supabase
      .from('comments')
      .update({ content: editCommentText.trim() })
      .eq('id', editingCommentId)
      .eq('user_id', currentUserId)
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
    if (!currentUserId || !activeVideoId) return
    if (!confirm('Hapus komentar ini?')) return

    const replyIds = comments.filter((c) => c.parent_id === comment.id).map((c) => c.id)
    const idsToDelete = [comment.id, ...replyIds]

    const { error } = await supabase.from('comments').delete().in('id', idsToDelete)
    if (error) {
      toast('Gagal hapus: ' + error.message, 'error')
      return
    }

    const removeCount = idsToDelete.length
    for (let i = 0; i < removeCount; i++) {
      await supabase.rpc('decrement_comments', { video_id: activeVideoId })
    }
    setVideos((prev) =>
      prev.map((v) =>
        v.id === activeVideoId
          ? { ...v, comments_count: Math.max(0, (v.comments_count || 0) - removeCount) }
          : v
      )
    )
    setComments((prev) => prev.filter((c) => !idsToDelete.includes(c.id)))
  }

  const handleShare = async () => {
    const url = startId
      ? `${window.location.origin}/v/${startId}`
      : `${window.location.origin}/user-videos?userId=${userId}`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'VEZAO', text: 'Lihat video ini di VEZAO!', url })
      } catch {}
    } else {
      await navigator.clipboard.writeText(url)
      toast('Link berhasil disalin!', 'success')
    }
  }

  const handleDelete = async (videoId: string) => {
    if (!currentUserId || currentUserId !== userId) {
      toast('Kamu hanya bisa menghapus video milik sendiri', 'error')
      return
    }
    if (!confirm('Yakin ingin menghapus video ini?')) return
    const { error } = await supabase
      .from('videos')
      .delete()
      .eq('id', videoId)
      .eq('user_id', currentUserId)
    if (error) {
      toast('Gagal menghapus: ' + error.message, 'error')
      return
    }
    setVideos((prev) => prev.filter((v) => v.id !== videoId))
    setShowMore(null)
    router.replace('/profile')
  }

  const togglePin = async (videoId: string) => {
    if (!currentUserId || currentUserId !== userId) return
    const video = videos.find((v) => v.id === videoId)
    if (!video) return
    const currentlyPinned = !!video.is_pinned
    if (!currentlyPinned) {
      const pinnedCount = videos.filter((v) => v.is_pinned).length
      if (pinnedCount >= 3) {
        toast('Maksimal 3 video yang bisa di-pin', 'error')
        return
      }
    }
    const { error } = await supabase
      .from('videos')
      .update({ is_pinned: !currentlyPinned })
      .eq('id', videoId)
      .eq('user_id', currentUserId)
    if (error) {
      toast('Gagal: ' + error.message, 'error')
      return
    }
    setVideos((prev) =>
      prev.map((v) => (v.id === videoId ? { ...v, is_pinned: !currentlyPinned } : v))
    )
    setShowMore(null)
  }

  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  if (videos.length === 0) {
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center text-white gap-4">
        <p className="text-gray-400">Belum ada video</p>
        <button
          onClick={() => router.back()}
          className="bg-vezao-gradient px-6 py-2 rounded-full text-sm"
        >
          Kembali
        </button>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-screen bg-black overflow-y-scroll snap-y snap-mandatory"
    >
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-12 bg-gradient-to-b from-black/70 to-transparent">
        <button onClick={() => router.back()} className="text-white text-lg font-bold">
          ←
        </button>
        <span className="font-semibold text-sm">
          @{videos[0]?.profiles?.username || 'user'}
        </span>
        <button onClick={() => setIsMuted(!isMuted)}>
          <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                        {isMuted ? (
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
                  d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                />
              </svg>
            ) : (
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
                  d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
              </svg>
            )}
          </div>
        </button>
      </div>

      {videos.map((video, index) => {
        const isLiked = likedVideos.has(video.id)
        return (
          <div
            key={video.id}
            className="h-screen w-full snap-start relative flex items-center justify-center"
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
              preload="auto"
              onClick={(e) => handleVideoTap(video.id, e.currentTarget)}
            />

            {heartAnim === video.id && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                <span className="text-7xl text-red-500 animate-ping">♥</span>
              </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 h-52 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />

            <div className="absolute bottom-24 left-4 right-20 text-white z-10">
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  onClick={() =>
                    router.push(`/@${video.profiles?.username || video.user_id}`)
                  }
                  className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700 shrink-0 border border-white/20 cursor-pointer"
                >
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
                <p
                  onClick={() =>
                    router.push(`/@${video.profiles?.username || video.user_id}`)
                  }
                  className="font-semibold text-sm cursor-pointer"
                >
                  @{video.profiles?.username || 'user'}
                </p>
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

            <div className="absolute right-3 bottom-32 flex flex-col items-center gap-4 z-10">
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
                    toast('Komentar dimatikan untuk video ini', 'error')
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

              <button onClick={() => toggleSave(video.id)} className="flex flex-col items-center">
                <div
                  className={`w-11 h-11 rounded-full flex items-center justify-center border border-white/10 ${
                    savedVideos.has(video.id) ? 'bg-yellow-500' : 'bg-black/40 backdrop-blur-md'
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
                <span className="text-xs mt-1 text-white font-medium">
                  {video.saves_count || 0}
                </span>
              </button>

              <button onClick={handleShare} className="flex flex-col items-center">
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
          </div>
        )
      })}

      {showMore && (
        <div className="fixed inset-0 z-[70] flex items-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowMore(null)} />
          <div className="relative w-full bg-zinc-900 rounded-t-2xl p-4 pb-10">
            <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-6" />
            <div className="grid grid-cols-4 gap-4 text-center">
              <button
                onClick={async () => {
                  if (!showMore) return
                  const url = `${window.location.origin}/v/${showMore}`
                  try {
                    await navigator.clipboard.writeText(url)
                    toast('Tautan disalin!', 'success')
                  } catch {
                    prompt('Salin tautan:', url)
                  }
                  setShowMore(null)
                }}
                className="flex flex-col items-center gap-1"
              >
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg">🔗</div>
                <span className="text-xs">Salin tautan</span>
              </button>

              {currentUserId === userId && (
                <>
                  <button
                    onClick={() => {
                      setShowMore(null)
                      router.push(`/upload?draft=${showMore}`)
                    }}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg">✏️</div>
                    <span className="text-xs">Edit</span>
                  </button>
                  <button onClick={() => togglePin(showMore)} className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-xl">📌</div>
                    <span className="text-xs">
                      {videos.find((v) => v.id === showMore)?.is_pinned ? 'Unpin' : 'Pin'}
                    </span>
                  </button>
                  <button onClick={() => handleDelete(showMore)} className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg">🗑️</div>
                    <span className="text-xs text-red-500">Hapus</span>
                  </button>
                </>
              )}

              {currentUserId !== userId && (
                <button
                  onClick={async () => {
                    const reason = prompt('Alasan report (opsional):')
                    if (reason === null) return
                    const video = videos.find((v) => v.id === showMore)
                    const { error } = await supabase.from('reports').insert({
                      reporter_id: currentUserId,
                      reported_user_id: video?.user_id || userId,
                      video_id: showMore,
                      reason: reason || null,
                    })
                    if (error) toast('Gagal report: ' + error.message, 'error')
                    else toast('Terima kasih. Laporan sudah dikirim.', 'success')
                    setShowMore(null)
                  }}
                  className="flex flex-col items-center gap-1"
                >
                  <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg">🚩</div>
                  <span className="text-xs text-orange-400">Report</span>
                </button>
              )}

              <button className="flex flex-col items-center gap-1" onClick={() => setShowMore(null)}>
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg">✕</div>
                <span className="text-xs">Tutup</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
                    const isOwn = c.user_id === currentUserId
                    return (
                      <div key={c.id} className="space-y-2">
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700 shrink-0">
                            {c.profiles?.avatar_url ? (
                              <img src={c.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs font-bold bg-vezao-gradient">
                                {c.profiles?.username?.[0]?.toUpperCase() || 'U'}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold">@{c.profiles?.username || 'user'}</p>
                            {editingCommentId === c.id ? (
                              <div className="mt-1 space-y-2">
                                <input
                                  value={editCommentText}
                                  onChange={(e) => setEditCommentText(e.target.value)}
                                  className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                                  autoFocus
                                />
                                <div className="flex gap-2">
                                  <button onClick={saveEditComment} className="text-xs text-purple-400 font-medium">
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
                              <p className="text-sm text-gray-300">{c.content}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className="text-[11px] text-gray-500">{formatDateTime(c.created_at)}</span>
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
                                <span className={likedComments.has(c.id) ? 'text-red-500' : 'text-gray-500'}>
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
                                  <button onClick={() => deleteComment(c)} className="text-[11px] text-red-400">
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
                              const isOwnReply = r.user_id === currentUserId
                              return (
                                <div key={r.id} className="flex gap-2">
                                  <div className="w-7 h-7 rounded-full overflow-hidden bg-zinc-700 shrink-0">
                                    {r.profiles?.avatar_url ? (
                                      <img src={r.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-[10px] font-bold bg-vezao-gradient">
                                        {r.profiles?.username?.[0]?.toUpperCase() || 'U'}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold">@{r.profiles?.username || 'user'}</p>
                                    {editingCommentId === r.id ? (
                                      <div className="mt-1 space-y-1">
                                        <input
                                          value={editCommentText}
                                          onChange={(e) => setEditCommentText(e.target.value)}
                                          className="w-full bg-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
                                          autoFocus
                                        />
                                        <div className="flex gap-2">
                                          <button onClick={saveEditComment} className="text-[10px] text-purple-400">
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
                                      <p className="text-xs text-gray-300">{r.content}</p>
                                    )}
                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                      <span className="text-[10px] text-gray-500">{formatDateTime(r.created_at)}</span>
                                      <button
                                        onClick={() => toggleCommentLike(r.id)}
                                        className="flex items-center gap-0.5 text-[10px]"
                                      >
                                        <span className={likedComments.has(r.id) ? 'text-red-500' : 'text-gray-500'}>
                                          {likedComments.has(r.id) ? '♥' : '♡'}
                                        </span>
                                        {(r.likes_count || 0) > 0 && (
                                          <span className="text-gray-500">{r.likes_count}</span>
                                        )}
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
                                          <button onClick={() => deleteComment(r)} className="text-[10px] text-red-400">
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
                    Membalas <span className="text-purple-400">@{replyTo.profiles?.username || 'user'}</span>
                  </p>
                  <button onClick={() => setReplyTo(null)} className="text-xs text-gray-500">
                    Batal
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={
                    replyTo ? `Balas @${replyTo.profiles?.username || 'user'}...` : 'Tulis komentar...'
                  }
                  className="flex-1 bg-zinc-800 rounded-full px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                />
                <button onClick={submitComment} className="bg-vezao-gradient px-5 py-2.5 rounded-full text-sm font-medium">
                  Kirim
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UserVideosInner() {
  const searchParams = useSearchParams()
  const userId = searchParams.get('userId') || ''
  const startId = searchParams.get('start') || ''
  return <UserVideosContent key={`${userId}-${startId}`} />
}

export default function UserVideosPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <UserVideosInner />
    </Suspense>
  )
}