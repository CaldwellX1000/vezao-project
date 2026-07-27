'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'

type Video = {
  id: string
  caption: string | null
  video_url: string
  likes_count: number
  comments_count: number
  comments_enabled?: boolean | null
  visibility?: string | null
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
  profiles: {
    username: string | null
    avatar_url: string | null
  } | null
}

function UserVideosContent() {
  const searchParams = useSearchParams()
  const userId = searchParams.get('userId')

  const [videos, setVideos] = useState<Video[]>([])
  const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [isMuted, setIsMuted] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showMore, setShowMore] = useState<string | null>(null)
  const [showComments, setShowComments] = useState(false)
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [heartAnim, setHeartAnim] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([])
  const lastTapRef = useRef<{ time: number; videoId: string } | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!userId) {
        router.replace('/')
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
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
          id,
          caption,
          video_url,
          likes_count,
          comments_count,
          comments_enabled,
          visibility,
          created_at,
          user_id,
          profiles (
            username,
            full_name,
            avatar_url
          )
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

      setVideos(filtered as any)

      const { data: likesData } = await supabase
        .from('likes')
        .select('video_id')
        .eq('user_id', user.id)

      if (likesData) {
        setLikedVideos(new Set(likesData.map((l) => l.video_id)))
      }

      setLoading(false)
    }

    load()
  }, [userId])

  useEffect(() => {
    if (videos.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target as HTMLVideoElement
          if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
            video.muted = isMuted
            video.play().catch(() => {})
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
  }, [videos, isMuted])

  useEffect(() => {
    if (videos.length === 0) return

    const timer = setTimeout(() => {
      const firstVideo = videoRefs.current[0]
      if (firstVideo) {
        firstVideo.muted = true
        firstVideo.play().catch(() => {})
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [videos])

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
      const { error } = await supabase.from('likes').insert({ user_id: currentUserId, video_id: videoId })
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
        await supabase.from('notifications').insert({
          user_id: video.user_id,
          actor_id: currentUserId,
          type: 'like',
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
      if (!likedVideos.has(videoId)) {
        toggleLike(videoId)
      }
      setHeartAnim(videoId)
      setTimeout(() => setHeartAnim(null), 800)
    } else {
      lastTapRef.current = { time: now, videoId }
      if (videoEl.paused) {
        videoEl.play().catch(() => {})
      } else {
        videoEl.pause()
      }
    }
  }

  const openComments = async (videoId: string) => {
    setActiveVideoId(videoId)
    setShowComments(true)
    setLoadingComments(true)

    const { data } = await supabase
      .from('comments')
      .select(`
        id,
        content,
        created_at,
        user_id,
        profiles (
          username,
          avatar_url
        )
      `)
      .eq('video_id', videoId)
      .order('created_at', { ascending: false })

    if (data) setComments(data as any)
    setLoadingComments(false)
  }

  const submitComment = async () => {
    if (!newComment.trim() || !currentUserId || !activeVideoId) return

    const content = newComment.trim()

    const { error } = await supabase.from('comments').insert({
      video_id: activeVideoId,
      user_id: currentUserId,
      content,
    })

    if (error) {
      alert('Gagal kirim komentar: ' + error.message)
      return
    }

    await supabase.rpc('increment_comments', { video_id: activeVideoId })
    setNewComment('')
    setVideos((prev) =>
      prev.map((v) =>
        v.id === activeVideoId
          ? { ...v, comments_count: (v.comments_count || 0) + 1 }
          : v
      )
    )

    const video = videos.find((v) => v.id === activeVideoId)
    if (video && video.user_id !== currentUserId) {
      await supabase.from('notifications').insert({
        user_id: video.user_id,
        actor_id: currentUserId,
        type: 'comment',
        video_id: activeVideoId,
        message: content,
        is_read: false,
      })
    }

    await openComments(activeVideoId)
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/user-videos?userId=${userId}`
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'VEZAO',
          text: 'Lihat video ini di VEZAO!',
          url,
        })
      } catch {}
    } else {
      await navigator.clipboard.writeText(url)
      alert('Link berhasil disalin!')
    }
  }

  const handleDelete = async (videoId: string) => {
    if (!currentUserId || currentUserId !== userId) {
      alert('Kamu hanya bisa menghapus video milik sendiri')
      return
    }

    const confirmDelete = confirm('Yakin ingin menghapus video ini?')
    if (!confirmDelete) return

    const { error } = await supabase
      .from('videos')
      .delete()
      .eq('id', videoId)
      .eq('user_id', currentUserId)

    if (error) {
      alert('Gagal menghapus: ' + error.message)
      return
    }

    setVideos((prev) => prev.filter((v) => v.id !== videoId))
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
    <div className="h-screen bg-black overflow-y-scroll snap-y snap-mandatory">
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
                  viewBox="0 0 24 24" fill="currentColor"
                >
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 h-52 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />

            <div className="absolute bottom-24 left-4 right-20 text-white z-10">
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  onClick={() => router.push(`/user-profile?userId=${video.user_id}`)}
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
                  onClick={() => router.push(`/user-profile?userId=${video.user_id}`)}
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
            </div>

            <div className="absolute right-3 bottom-32 flex flex-col items-center gap-4 z-10">
              <button onClick={() => toggleLike(video.id)} className="flex flex-col items-center">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center border border-white/10 ${isLiked ? 'bg-red-500' : 'bg-black/40 backdrop-blur-md'}`}>
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

              <button onClick={handleShare} className="flex flex-col items-center">
                <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </div>
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
              {currentUserId === userId && (
                <button onClick={() => handleDelete(showMore)} className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </div>
                  <span className="text-xs text-red-500">Hapus</span>
                </button>
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

                    if (error) {
                      alert('Gagal report: ' + error.message)
                    } else {
                      alert('Terima kasih. Laporan sudah dikirim.')
                    }
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
            </div>
          </div>
        </div>
      )}

      {showComments && (
        <div className="fixed inset-0 z-[60] flex items-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowComments(false)} />
          <div className="relative w-full bg-zinc-900 rounded-t-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="font-semibold">Comments</h3>
              <button onClick={() => setShowComments(false)} className="text-gray-400 text-lg">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {loadingComments ? (
                <p className="text-center text-gray-500 py-8">Loading...</p>
              ) : comments.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Belum ada komentar</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700 shrink-0">
                      {c.profiles?.avatar_url ? (
                        <img src={c.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold bg-vezao-gradient">
                          {c.profiles?.username?.[0]?.toUpperCase() || 'U'}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">@{c.profiles?.username || 'user'}</p>
                      <p className="text-sm text-gray-300">{c.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-white/10 flex gap-2">
              <input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Tulis komentar..."
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
      )}
    </div>
  )
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
      <UserVideosContent />
    </Suspense>
  )
}