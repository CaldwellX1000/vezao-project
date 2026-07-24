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

      // Ambil video
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

      // Ambil likes
      const { data: likesData } = await supabase
        .from('likes')
        .select('video_id')
        .eq('user_id', user.id)

      if (likesData) {
        setLikedVideos(new Set(likesData.map((l) => l.video_id)))
      }

      // Ambil following
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

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target as HTMLVideoElement
          if (entry.isIntersecting) {
            video.play().catch(() => {})
          } else {
            video.pause()
          }
        })
      },
      { threshold: 0.7 }
    )

    videoRefs.current.forEach((v) => v && observer.observe(v))
    return () => observer.disconnect()
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

      if (error) {
        console.error(error.message)
        return
      }

      setFollowing((prev) => new Set(prev).add(targetUserId))
    }
  }

  const openComments = async (videoId: string) => {
    setActiveVideoId(videoId)
    setShowComments(true)
    setLoadingComments(true)

    const { data } = await supabase
      .from('comments')
      .select('id, content, created_at, user_id')
      .eq('video_id', videoId)
      .order('created_at', { ascending: false })

    if (data) {
      const commentsWithUser = await Promise.all(
        data.map(async (c) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', c.user_id)
            .single()
          return {
            ...c,
            profiles: { username: profile?.username || 'user' }
          }
        })
      )
      setComments(commentsWithUser as any)
    }

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

  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center text-white">
        Loading...
      </div>
    )
  }

  return (
    <div className="h-screen bg-black overflow-y-scroll snap-y snap-mandatory pb-16">
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-12 bg-gradient-to-b from-black/60 to-transparent">
        <span className="font-bold text-white text-lg">VEZAO</span>
      </div>

      {videos.length === 0 ? (
        <div className="h-screen flex items-center justify-center text-gray-500">
          Belum ada video
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
                ref={(el) => { videoRefs.current[index] = el }}
                src={video.video_url}
                className="absolute inset-0 w-full h-full object-cover"
                loop
                muted
                playsInline
              />

              <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black/80 to-transparent" />

              <div className="absolute bottom-24 left-4 right-20 text-white z-10">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-sm">
                    @{video.profiles?.username || 'user'}
                  </p>
                  {!isOwnVideo && (
                    <button
                      onClick={() => toggleFollow(video.user_id)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        isFollowing
                          ? 'bg-white/20 text-white'
                          : 'bg-white text-black'
                      }`}
                    >
                      {isFollowing ? 'Following' : 'Follow'}
                    </button>
                  )}
                </div>
                <p className="text-sm opacity-90 line-clamp-2">{video.caption}</p>
              </div>

              <div className="absolute right-3 bottom-32 flex flex-col items-center gap-5 z-10">
                <button
                  onClick={() => {
                    setIsMuted(!isMuted)
                    videoRefs.current.forEach((v) => {
                      if (v) v.muted = !isMuted
                    })
                  }}
                  className="flex flex-col items-center"
                >
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl">
                    {isMuted ? '🔇' : '🔊'}
                  </div>
                </button>

                <button
                  onClick={() => toggleLike(video.id)}
                  className="flex flex-col items-center"
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${isLiked ? 'bg-red-500' : 'bg-white/20'}`}>
                    {isLiked ? '❤️' : '♡'}
                  </div>
                  <span className="text-xs mt-1 text-white">{video.likes_count}</span>
                </button>

                <button
                  onClick={() => openComments(video.id)}
                  className="flex flex-col items-center"
                >
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl">
                    💬
                  </div>
                  <span className="text-xs mt-1 text-white">{video.comments_count || 0}</span>
                </button>

                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl">
                    ↗
                  </div>
                  <span className="text-xs mt-1 text-white">Share</span>
                </div>
              </div>
            </div>
          )
        })
      )}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-black border-t border-white/10 h-16 flex items-center justify-around z-50">
        <button onClick={() => router.push('/')} className="flex flex-col items-center gap-1">
          <span className="text-xl text-white">🏠</span>
          <span className="text-xs text-white">Home</span>
        </button>
        <button onClick={() => router.push('/upload')} className="flex flex-col items-center gap-1">
          <span className="text-xl text-gray-500">➕</span>
          <span className="text-xs text-gray-500">Upload</span>
        </button>
        <button onClick={() => router.push('/profile')} className="flex flex-col items-center gap-1">
          <span className="text-xl text-gray-500">👤</span>
          <span className="text-xs text-gray-500">Profile</span>
        </button>
      </div>

      {/* Comments Modal */}
      {showComments && (
        <div className="fixed inset-0 z-[60] flex items-end">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowComments(false)}
          />
          <div className="relative w-full bg-zinc-900 rounded-t-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="font-semibold">Comments</h3>
              <button onClick={() => setShowComments(false)} className="text-gray-400">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {loadingComments ? (
                <p className="text-center text-gray-500 py-8">Loading...</p>
              ) : comments.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Belum ada komentar</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold">
                      {c.profiles?.username?.[0]?.toUpperCase() || 'U'}
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
                className="flex-1 bg-zinc-800 rounded-full px-4 py-2 text-sm focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && submitComment()}
              />
              <button
                onClick={submitComment}
                className="bg-indigo-600 px-4 py-2 rounded-full text-sm font-medium"
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