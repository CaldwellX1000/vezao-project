'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

type Video = {
  id: string
  caption: string | null
  video_url: string
  likes_count: number
  comments_count: number
  views_count?: number | null
  saves_count?: number | null
  shares_count?: number | null
  comments_enabled?: boolean | null
  created_at?: string
  user_id: string
  is_pinned?: boolean | null
  visibility?: string | null
  is_draft?: boolean | null
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

export default function SingleVideoPage() {
  const params = useParams()
  const rawId = params?.id
  const startVideoId = Array.isArray(rawId) ? rawId[0] : (rawId as string)

  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set())
  const [savedVideos, setSavedVideos] = useState<Set<string>>(new Set())
  const [userId, setUserId] = useState<string | null>(null)
  const [heartAnim, setHeartAnim] = useState<string | null>(null)

  const [showComments, setShowComments] = useState(false)
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set())
  const [newComment, setNewComment] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentText, setEditCommentText] = useState('')
  const [showMore, setShowMore] = useState<string | null>(null)
  const [shareVideoId, setShareVideoId] = useState<string | null>(null)
  const [shareFriends, setShareFriends] = useState<
    { id: string; username: string | null; full_name: string | null; avatar_url: string | null }[]
  >([])
  const [loadingShareFriends, setLoadingShareFriends] = useState(false)
  const [sharingTo, setSharingTo] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const initialDoneRef = useRef(false)
  const lastTapRef = useRef<{ time: number; videoId: string } | null>(null)
  const viewedIdsRef = useRef<Set<string>>(new Set())

  const registerView = async (videoId: string) => {
    if (viewedIdsRef.current.has(videoId)) return
    viewedIdsRef.current.add(videoId)
    try {
      await supabase.rpc('increment_views', { video_id: videoId })
    } catch {}
  }

  useEffect(() => {
    const load = async () => {
      if (!startVideoId) {
        router.replace('/')
        return
      }
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace(`/login?next=/v/${startVideoId}`)
        return
      }
      setUserId(user.id)

      const { data: startVideo, error } = await supabase
        .from('videos')
        .select(
          `
          id, caption, video_url, likes_count, comments_count, saves_count, shares_count, comments_enabled,
          created_at, user_id, is_pinned, visibility, is_draft,
          profiles ( username, full_name, avatar_url )
        `
        )
        .eq('id', startVideoId)
        .eq('is_draft', false)
        .single()

      if (error || !startVideo) {
        setLoading(false)
        return
      }

      const ownerId = startVideo.user_id
      const { data: all } = await supabase
        .from('videos')
        .select(
          `
          id, caption, video_url, likes_count, comments_count, saves_count, shares_count, comments_enabled,
          created_at, user_id, is_pinned, visibility, is_draft,
          profiles ( username, full_name, avatar_url )
        `
        )
        .eq('user_id', ownerId)
        .eq('is_draft', false)
        .order('created_at', { ascending: false })

      const isOwn = user.id === ownerId
      let list: Video[] = ((all || []) as any[]).filter((v) => {
        if (isOwn) return true
        const vis = String(v.visibility || 'public').toLowerCase().trim()
        if (vis === 'private') return false
        return true
      })

      list = [...list].sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1
        if (!a.is_pinned && b.is_pinned) return 1
        return 0
      })

      if (!list.find((v) => v.id === startVideoId)) {
        list = [startVideo as any, ...list]
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
  }, [startVideoId])

  useEffect(() => {
    if (videos.length === 0) return
    initialDoneRef.current = false
    const timer = setTimeout(() => {
      let index = videos.findIndex((v) => v.id === startVideoId)
      if (index < 0) index = 0
      videoRefs.current.forEach((v) => {
        if (!v) return
        v.pause()
        try {
          v.currentTime = 0
        } catch {}
      })
      const container = containerRef.current
      if (container) container.scrollTop = index * window.innerHeight
      const el = videoRefs.current[index]
      if (el) {
        el.muted = false
        setIsMuted(false)
        el.play().catch(async () => {
          el.muted = true
          try {
            await el.play()
            el.muted = false
            setIsMuted(false)
          } catch {}
        })
        registerView(videos[index].id)
      }
      initialDoneRef.current = true
    }, 300)
    return () => clearTimeout(timer)
  }, [videos, startVideoId])

  useEffect(() => {
    if (videos.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!initialDoneRef.current) return
        entries.forEach((entry) => {
          const video = entry.target as HTMLVideoElement
          const id = video.dataset.videoId
          if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
            videoRefs.current.forEach((v) => {
              if (v && v !== video) v.pause()
            })
            video.muted = isMuted
            video.play().catch(async () => {
              if (!isMuted) {
                video.muted = true
                try {
                  await video.play()
                  video.muted = false
                } catch {}
              }
            })
            if (id) registerView(id)
          } else {
            video.pause()
          }
        })
      },
      { threshold: [0.65] }
    )
    videoRefs.current.forEach((v) => {
      if (v) observer.observe(v)
    })
    return () => observer.disconnect()
  }, [videos, isMuted])

  useEffect(() => {
    videoRefs.current.forEach((v) => {
      if (v) v.muted = isMuted
    })
  }, [isMuted])

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
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId ? { ...v, likes_count: Math.max(0, v.likes_count - 1) } : v
        )
      )
    } else {
      const { error } = await supabase
        .from('likes')
        .insert({ user_id: userId, video_id: videoId })
      if (error) return
      await supabase.rpc('increment_likes', { video_id: videoId })
      setLikedVideos((prev) => new Set(prev).add(videoId))
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId ? { ...v, likes_count: v.likes_count + 1 } : v
        )
      )
    }
  }

  const toggleSave = async (videoId: string) => {
    if (!userId) return
    const isSaved = savedVideos.has(videoId)
    if (isSaved) {
      await supabase.from('saves').delete().eq('user_id', userId).eq('video_id', videoId)
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
        .insert({ user_id: userId, video_id: videoId })
      if (error) return
      setSavedVideos((prev) => new Set(prev).add(videoId))
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId
            ? { ...v, saves_count: (v.saves_count || 0) + 1 }
            : v
        )
      )
    }
  }

  const openComments = async (videoId: string) => {
    const video = videos.find((v) => v.id === videoId)
    if (video && video.comments_enabled === false) {
      alert('Komentar dinonaktifkan untuk video ini')
      return
    }
    setActiveVideoId(videoId)
    setShowComments(true)
    setLoadingComments(true)
    setReplyTo(null)
    setEditingCommentId(null)

    const { data } = await supabase
      .from('comments')
      .select(
        `
        id, content, created_at, user_id, parent_id, likes_count,
        profiles ( username, avatar_url )
      `
      )
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

    try {
      await supabase.rpc('increment_comments', { video_id: activeVideoId })
    } catch {}
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
    await openComments(activeVideoId)
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
    if (!editingCommentId || !editCommentText.trim()) return
    const { error } = await supabase
      .from('comments')
      .update({ content: editCommentText.trim() })
      .eq('id', editingCommentId)
      .eq('user_id', userId!)
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
    const removeCount = idsToDelete.length
    for (let i = 0; i < removeCount; i++) {
      try {
        await supabase.rpc('decrement_comments', { video_id: activeVideoId })
      } catch {}
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

  const handleTap = (videoId: string, el: HTMLVideoElement) => {
    const now = Date.now()
    const last = lastTapRef.current
    if (last && last.videoId === videoId && now - last.time < 300) {
      lastTapRef.current = null
      if (!likedVideos.has(videoId)) toggleLike(videoId)
      setHeartAnim(videoId)
      setTimeout(() => setHeartAnim(null), 800)
    } else {
      lastTapRef.current = { time: now, videoId }
      if (el.paused) el.play().catch(() => {})
      else el.pause()
    }
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
    const video = videos.find((v) => v.id === shareVideoId)
    const nextCount = (video?.shares_count || 0) + 1
    setVideos((prev) =>
      prev.map((v) =>
        v.id === shareVideoId ? { ...v, shares_count: nextCount } : v
      )
    )
    await supabase.from('videos').update({ shares_count: nextCount }).eq('id', shareVideoId)
    alert('Video terkirim!')
    setShareVideoId(null)
  }

  const shareToOtherApps = async () => {
    if (!shareVideoId) return
    const url = `${window.location.origin}/v/${shareVideoId}`
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'VEZAO', text: 'Lihat video ini di VEZAO!', url })
        const video = videos.find((v) => v.id === shareVideoId)
        const nextCount = (video?.shares_count || 0) + 1
        setVideos((prev) =>
          prev.map((v) =>
            v.id === shareVideoId ? { ...v, shares_count: nextCount } : v
          )
        )
        await supabase.from('videos').update({ shares_count: nextCount }).eq('id', shareVideoId)
        setShareVideoId(null)
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url)
        alert('Tautan disalin')
      } catch {
        prompt('Salin tautan:', url)
      }
    }
  }

  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  if (videos.length === 0) {
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center gap-4 text-white">
        <p>Video tidak ditemukan</p>
        <button onClick={() => router.back()} className="bg-vezao-gradient px-6 py-2.5 rounded-full text-sm">
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
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-12 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 pointer-events-auto"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button onClick={() => setIsMuted(!isMuted)} className="pointer-events-auto">
          <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
            {isMuted ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
            )}
          </div>
        </button>
      </div>

      {videos.map((video, index) => {
        const isLiked = likedVideos.has(video.id)
        const isSaved = savedVideos.has(video.id)
        return (
          <div key={video.id} className="h-screen w-full snap-start relative flex items-center justify-center">
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
              preload={index < 3 ? 'auto' : 'metadata'}
              onClick={(e) => handleTap(video.id, e.currentTarget)}
            />
            {heartAnim === video.id && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                <span className="text-7xl text-red-500 animate-ping">♥</span>
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />
            <div className="absolute bottom-8 left-4 right-20 text-white z-10">
              <div
                className="flex items-center gap-2 mb-1.5 cursor-pointer"
                onClick={() => router.push(`/@${video.profiles?.username || video.user_id}`)}
              >
                <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700 border border-white/20">
                  {video.profiles?.avatar_url ? (
                    <img src={video.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold bg-vezao-gradient">
                      {video.profiles?.username?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
                <p className="font-semibold text-sm">@{video.profiles?.username || 'user'}</p>
              </div>
              <p className="text-sm opacity-90 line-clamp-3">{video.caption}</p>
              {video.created_at && (
                <p className="text-[11px] text-white/50 mt-1">{formatDateTime(video.created_at)}</p>
              )}
            </div>

            <div className="absolute right-2 bottom-24 flex flex-col items-center gap-3 z-10">
              <button onClick={() => toggleLike(video.id)} className="flex flex-col items-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center border border-white/10 ${
                    isLiked ? 'bg-red-500/90' : 'bg-black/40 backdrop-blur-md'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" viewBox="0 0 24 24" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <span className="text-[10px] mt-0.5 text-white font-medium">{video.likes_count}</span>
              </button>

              <button onClick={() => openComments(video.id)} className="flex flex-col items-center">
                <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <span className="text-[10px] mt-0.5 text-white font-medium">{video.comments_count || 0}</span>
              </button>

              <button onClick={() => toggleSave(video.id)} className="flex flex-col items-center">
                <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                  <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 ${isSaved ? 'text-yellow-400' : 'text-white'}`} fill={isSaved ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </div>
                <span className="text-[10px] mt-0.5 text-white font-medium">{video.saves_count || 0}</span>
              </button>

              <button onClick={() => openShare(video.id)} className="flex flex-col items-center">
                <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
                  </svg>
                </div>
                <span className="text-[10px] mt-0.5 text-white font-medium">{video.shares_count || 0}</span>
              </button>

              <button onClick={() => setShowMore(video.id)}>
                <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                  <span className="text-base leading-none">⋯</span>
                </div>
              </button>
            </div>
          </div>
        )
      })}

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
          <div className="relative w-full max-w-[480px] mx-auto bg-zinc-900 rounded-t-2xl max-h-[75vh] flex flex-col">
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
                              <button onClick={() => toggleCommentLike(c.id)} className="flex items-center gap-1 text-[11px]">
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
                                    <button onClick={() => startEditComment(c)} className="text-[11px] text-gray-400">
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
                              const isOwnReply = r.user_id === userId
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
                                          <button onClick={() => setEditingCommentId(null)} className="text-[10px] text-gray-500">
                                            Batal
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-xs text-gray-300">{r.content}</p>
                                    )}
                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                      <span className="text-[10px] text-gray-500">{formatDateTime(r.created_at)}</span>
                                      <button onClick={() => toggleCommentLike(r.id)} className="flex items-center gap-0.5 text-[10px]">
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
                                            <button onClick={() => startEditComment(r)} className="text-[10px] text-gray-400">
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

      {showMore && (
        <div className="fixed inset-0 z-[70] flex items-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowMore(null)} />
          <div className="relative w-full max-w-[480px] mx-auto bg-zinc-900 rounded-t-2xl p-4 pb-10">
            <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-6" />
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
              className="w-full text-left px-4 py-3.5 text-sm hover:bg-white/5 rounded-xl"
            >
              Salin tautan
            </button>
            <button onClick={() => setShowMore(null)} className="w-full text-center py-3 text-sm text-gray-400 mt-1">
              Tutup
            </button>
          </div>
        </div>
      )}

      {shareVideoId && (
        <div className="fixed inset-0 z-[80] flex items-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShareVideoId(null)} />
          <div className="relative w-full max-w-[480px] mx-auto bg-zinc-900 rounded-t-2xl p-4 pb-8 max-h-[75vh] flex flex-col">
            <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-3" />
            <h3 className="text-center font-semibold mb-1">Kirim video</h3>
            <p className="text-center text-xs text-gray-400 mb-4">Ke teman VEZAO atau app lain</p>

            <button
              onClick={shareToOtherApps}
              className="w-full flex items-center gap-3 px-3 py-3 mb-4 rounded-xl bg-zinc-800"
            >
              <div className="w-10 h-10 rounded-full bg-vezao-gradient flex items-center justify-center text-white font-bold">
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
                        <img src={f.avatar_url} alt="" className="w-full h-full object-cover" />
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
  )
}