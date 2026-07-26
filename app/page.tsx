'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Video = {
  id: string
  caption: string | null
  video_url: string
  likes_count: number
  comments_count: number
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

export default function FeedPage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set())
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(true)
  const [showComments, setShowComments] = useState(false)
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)

  const router = useRouter()
  const supabase = createClient()
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setUserId(user.id)

      const { data: videosData } = await supabase
        .from('videos')
        .select(`
          id,
          caption,
          video_url,
          likes_count,
          comments_count,
          created_at,
          user_id,
          profiles (
            username,
            full_name,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false })

      if (videosData) setVideos(videosData as any)

      const { data: likesData } = await supabase
        .from('likes')
        .select('video_id')
        .eq('user_id', user.id)

      if (likesData) {
        setLikedVideos(new Set(likesData.map((l) => l.video_id)))
      }

      const { data: followData } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)

      if (followData) {
        setFollowing(new Set(followData.map((f) => f.following_id)))
      }

      setLoading(false)
    }

    init()
  }, [])

  // Auto play & pause saat scroll
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

  // Paksa play video pertama
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
      const { error } = await supabase.from('likes').insert({ user_id: userId, video_id: videoId })
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
    if (!newComment.trim() || !userId || !activeVideoId) return

    const { error } = await supabase.from('comments').insert({
      video_id: activeVideoId,
      user_id: userId,
      content: newComment.trim(),
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
    await openComments(activeVideoId)
  }

  const handleShare = async (videoId: string) => {
    const url = `${window.location.origin}/?v=${videoId}`
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
      alert('Link video berhasil disalin!')
    }
  }

  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="h-screen bg-black overflow-y-scroll snap-y snap-mandatory pb-16">
      {/* Header + Mute button */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-12 bg-gradient-to-b from-black/70 to-transparent">
        <span className="font-bold text-lg tracking-wider text-vezao-gradient">VEZAO</span>

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

      {videos.length === 0 ? (
        <div className="h-screen flex flex-col items-center justify-center text-gray-500 gap-3">
          <p>Belum ada video</p>
          <button
            onClick={() => router.push('/upload')}
            className="bg-vezao-gradient text-white px-6 py-2 rounded-full text-sm font-medium"
          >
            Upload Video Pertama
          </button>
        </div>
      ) : (
        videos.map((video, index) => {
          const isLiked = likedVideos.has(video.id)
          const isFollowing = following.has(video.user_id)
          const isOwnVideo = video.user_id === userId

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
                onClick={(e) => {
                  const vid = e.currentTarget
                  if (vid.paused) {
                    vid.play().catch(() => {})
                  } else {
                    vid.pause()
                  }
                }}
              />

              <div className="absolute bottom-0 left-0 right-0 h-52 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />

              {/* Username + Caption */}
<div className="absolute bottom-24 left-4 right-20 text-white z-10">
  <div className="flex items-center gap-2 mb-1.5">
    <div
      onClick={() => router.push(`/user-profile?userId=${video.user_id}`)}
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
      onClick={() => router.push(`/user-profile?userId=${video.user_id}`)}
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
  <p className="text-sm opacity-90 line-clamp-2">{video.caption}</p>
</div>

              {/* Action buttons */}
              <div className="absolute right-3 bottom-32 flex flex-col items-center gap-4 z-10">
                {/* Like */}
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

                {/* Comment */}
                <button onClick={() => openComments(video.id)} className="flex flex-col items-center">
                  <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <span className="text-xs mt-1 text-white font-medium">{video.comments_count || 0}</span>
                </button>

                {/* Share */}
                <button onClick={() => handleShare(video.id)} className="flex flex-col items-center">
                  <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </div>
                  <span className="text-xs mt-1 text-white">Share</span>
                </button>
              </div>
            </div>
          )
        })
      )}

      {/* Bottom Navigation */}
<div className="fixed bottom-0 left-0 right-0 bg-black/95 border-t border-white/10 h-16 flex items-center justify-around z-50 backdrop-blur-md">
  {/* Home */}
  <button onClick={() => router.push('/')} className="flex flex-col items-center gap-0.5">
    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
    </svg>
    <span className="text-[11px] text-gray-400">Home</span>
  </button>

  {/* Upload */}
  <button onClick={() => router.push('/upload')} className="flex flex-col items-center gap-0.5">
    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
    <span className="text-[11px] text-gray-400">Upload</span>
  </button>

  {/* Profile */}
  <button onClick={() => router.push('/profile')} className="flex flex-col items-center gap-0.5">
    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
    <span className="text-[11px] text-white">Profile</span>
  </button>
</div>

      {/* Comments Modal */}
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