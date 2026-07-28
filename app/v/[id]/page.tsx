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
  comments_enabled?: boolean | null
  created_at?: string
  user_id: string
  profiles: {
    username: string | null
    full_name: string | null
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

export default function SingleVideoPage() {
  const params = useParams()
  const videoId = params?.id as string

  const [video, setVideo] = useState<Video | null>(null)
  const [loading, setLoading] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likesCount, setLikesCount] = useState(0)
  const [viewsCount, setViewsCount] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!videoId) {
        router.replace('/')
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace(`/login?next=/v/${videoId}`)
        return
      }
      setUserId(user.id)

const { data, error } = await supabase
        .from('videos')
        .select(`
          id,
          caption,
          video_url,
          likes_count,
          comments_count,
          comments_enabled,
          created_at,
          user_id,
          profiles (
            username,
            full_name,
            avatar_url
          )
        `)
        .eq('id', videoId)
        .eq('is_draft', false)
        .single()

      if (error || !data) {
        setLoading(false)
        return
      }

      setVideo(data as any)
      setLikesCount(data.likes_count || 0)

      const { data: likeRow } = await supabase
        .from('likes')
        .select('id')
        .eq('user_id', user.id)
        .eq('video_id', videoId)
        .maybeSingle()

      setLiked(!!likeRow)
      setLoading(false)

      setTimeout(() => {
        videoRef.current?.play().catch(() => {})
      }, 200)
    }

    load()
  }, [videoId])

  const toggleLike = async () => {
    if (!userId || !video) return

    if (liked) {
      await supabase.from('likes').delete().eq('user_id', userId).eq('video_id', video.id)
      await supabase.rpc('decrement_likes', { video_id: video.id })
      setLiked(false)
      setLikesCount((c) => Math.max(0, c - 1))
    } else {
      const { error } = await supabase.from('likes').insert({
        user_id: userId,
        video_id: video.id,
      })
      if (error) return
      await supabase.rpc('increment_likes', { video_id: video.id })
      setLiked(true)
      setLikesCount((c) => c + 1)
    }
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/v/${videoId}`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'VEZAO', text: 'Lihat video ini di VEZAO!', url })
      } catch {}
    } else {
      await navigator.clipboard.writeText(url)
      alert('Link video disalin!')
    }
  }

  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  if (!video) {
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center gap-4 text-white px-6 text-center">
        <p className="text-lg font-semibold">Video tidak ditemukan</p>
        <button
          onClick={() => router.push('/')}
          className="bg-vezao-gradient px-6 py-2.5 rounded-full text-sm font-medium"
        >
          Kembali ke Feed
        </button>
      </div>
    )
  }

  return (
    <div className="h-screen bg-black md:bg-zinc-950 relative overflow-hidden flex items-center justify-center">
      {/* Kolom video (mobile full, desktop portrait di tengah) */}
      <div className="relative h-full w-full md:w-[420px] md:max-w-[420px] md:h-[100dvh] md:shadow-2xl md:overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={video.video_url}
        className="absolute inset-0 w-full h-full object-cover"
        loop
        muted={isMuted}
        playsInline
        autoPlay
        onClick={(e) => {
          const v = e.currentTarget
          if (v.paused) v.play().catch(() => {})
          else v.pause()
        }}
      />

      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 h-12 bg-gradient-to-b from-black/70 to-transparent">
        <button
          onClick={() => router.push('/')}
          className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

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

      <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />

      <div className="absolute bottom-8 left-4 right-20 text-white z-10">
        <div
          className="flex items-center gap-2 mb-1.5 cursor-pointer"
          onClick={() => router.push(`/user-profile?userId=${video.user_id}`)}
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
        <p className="text-[11px] text-white/50 mt-1">
          {video.created_at ? formatDateTime(video.created_at) : ''}
          {viewsCount > 0 ? ` · 👁 ${viewsCount.toLocaleString('id-ID')} views` : ''}
        </p>
      </div>

      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 z-10">
        <button onClick={toggleLike} className="flex flex-col items-center">
          <div
            className={`w-11 h-11 rounded-full flex items-center justify-center border border-white/10 ${
              liked ? 'bg-red-500' : 'bg-black/40 backdrop-blur-md'
            }`}
          >
            {liked ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            )}
          </div>
          <span className="text-xs mt-1 text-white font-medium">{likesCount}</span>
        </button>

        <button onClick={handleShare} className="flex flex-col items-center">
          <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
            </svg>
          </div>
          <span className="text-xs mt-1 text-white font-medium">Share</span>
        </button>
      </div>
      </div>{/* tutup kolom video desktop */}
    </div>
  )
}