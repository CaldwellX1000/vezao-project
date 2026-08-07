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
  created_at: string
  user_id: string
  profiles: {
    username: string | null
    full_name: string | null
    avatar_url: string | null
  } | null
}

function HashtagContent() {
  const searchParams = useSearchParams()
  const tag = searchParams.get('tag') || ''

  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [isMuted, setIsMuted] = useState(true)

  const router = useRouter()
  const supabase = createClient()
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([])

  useEffect(() => {
    const load = async () => {
      if (!tag) {
        router.replace('/')
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data } = await supabase
        .from('videos')
        .select(`
          id,
          caption,
          video_url,
          thumbnail_url,
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
        .eq('is_draft', false)
        .ilike('caption', `%#${tag}%`)
        .order('created_at', { ascending: false })
        .limit(50)

      setVideos((data as any) || [])
      setLoading(false)
    }

    load()
  }, [tag])

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

    videoRefs.current.forEach((v) => {
      if (v) observer.observe(v)
    })

    return () => observer.disconnect()
  }, [videos, isMuted])

  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="h-screen bg-black overflow-y-scroll snap-y snap-mandatory pb-16">
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 h-12 bg-gradient-to-b from-[#0b0614]/90 via-[#0b0614]/50 to-transparent backdrop-blur-[2px]">
        <button onClick={() => router.back()} className="text-purple-300 text-lg font-bold">
          ←
        </button>
        <h1 className="text-white font-semibold text-sm">#{tag}</h1>
        <span className="text-purple-400/60 text-xs ml-1">{videos.length} video</span>

        <button onClick={() => setIsMuted(!isMuted)} className="ml-auto">
          <div className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center border border-white/10">
            {isMuted ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </div>
        </button>
      </div>

      {videos.length === 0 ? (
        <div className="h-screen flex flex-col items-center justify-center px-6 text-center gap-2">
          <div className="w-14 h-14 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-2">
            <span className="text-2xl text-purple-400/80">#</span>
          </div>
          <p className="text-sm font-medium text-white">Belum ada video</p>
          <p className="text-xs text-gray-500">Tidak ada postingan dengan #{tag}</p>
          <button onClick={() => router.back()} className="text-purple-400 text-sm mt-3 font-medium">
            Kembali
          </button>
        </div>
      ) : (
        videos.map((video, index) => (
          <div
            key={video.id}
            className="h-screen w-full snap-start relative flex items-center justify-center"
          >
            <video
              ref={(el) => {
                videoRefs.current[index] = el
              }}
              src={video.video_url}
              poster={(video as any).thumbnail_url || undefined}
              className="absolute inset-0 w-full h-full object-cover"
              loop
              muted={isMuted}
              playsInline
              preload={index < 2 ? 'auto' : 'metadata'}
              onClick={(e) => {
                const vid = e.currentTarget
                if (vid.paused) vid.play().catch(() => {})
                else vid.pause()
              }}
            />

            <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

            <div className="absolute bottom-20 left-4 right-4 text-white z-10">
              <p
                onClick={() =>
                  router.push(`/@${video.profiles?.username || video.user_id}`)
                }
                className="font-semibold text-sm mb-1 cursor-pointer"
              >
                @{video.profiles?.username || 'user'}
              </p>
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
          </div>
        ))
      )}
    </div>
  )
}

export default function HashtagPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen bg-black flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <HashtagContent />
    </Suspense>
  )
}