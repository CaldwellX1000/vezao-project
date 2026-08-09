'use client'

import { Suspense, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

type Video = {
  id: string
  caption: string | null
  video_url: string
  thumbnail_url: string | null
  likes_count: number
  views_count?: number | null
  sound_name?: string | null
  user_id: string
  profiles: {
    username: string | null
    avatar_url: string | null
  } | null
}

function SoundContent() {
  const searchParams = useSearchParams()
  const name = searchParams.get('name') || ''

  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      if (!name.trim()) {
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

      const { data } = await supabase
        .from('videos')
        .select(
          `
          id, caption, video_url, thumbnail_url, likes_count, views_count,
          sound_name, user_id,
          profiles ( username, avatar_url )
        `
        )
        .eq('is_draft', false)
        .ilike('sound_name', name.trim())
        .order('created_at', { ascending: false })
        .limit(60)

      const list = (data || []).filter((v: any) => {
        const vis = String(v.visibility || 'public').toLowerCase()
        return vis !== 'private'
      })

      setVideos(list as any)
      setLoading(false)
    }

    load()
  }, [name])

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0b0614]/95 backdrop-blur-md border-b border-pink-500/20">
        <div className="px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-lg text-pink-300"
          >
            ←
          </button>
          <h1 className="text-base font-semibold flex-1">Sound</h1>
        </div>

        {/* Sound info card */}
        <div className="px-4 pb-4">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-900/90 border border-pink-500/15">
            <div className="w-14 h-14 rounded-xl bg-vezao-gradient flex items-center justify-center text-2xl shrink-0 shadow-lg shadow-pink-500/20">
              🎵
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm leading-snug line-clamp-2">
                {name || 'Original sound'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {loading ? 'Memuat...' : `${videos.length} video`}
              </p>
            </div>
            <button
              onClick={() =>
                router.push(`/upload?sound=${encodeURIComponent(name.trim())}`)
              }
              className="shrink-0 text-xs font-semibold bg-vezao-gradient px-4 py-2.5 rounded-full active:scale-95 transition"
            >
              Gunakan
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-3 gap-[2px] px-1 pt-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[9/16] bg-zinc-900 animate-pulse rounded-sm"
            />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center pt-28 gap-3 px-8">
          <div className="w-16 h-16 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-3xl">
            🎵
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white">Belum ada video</p>
            <p className="text-xs text-gray-500 mt-1">
              Jadilah yang pertama pakai sound ini
            </p>
          </div>
          <button
            onClick={() =>
              router.push(`/upload?sound=${encodeURIComponent(name.trim())}`)
            }
            className="mt-2 text-xs font-semibold bg-vezao-gradient px-6 py-2.5 rounded-full text-white"
          >
            Buat video
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-[2px] px-1 pt-1">
          {videos.map((v) => (
            <div
              key={v.id}
              onClick={() => router.push(`/v/${v.id}`)}
              className="aspect-[9/16] bg-zinc-900 relative overflow-hidden cursor-pointer group"
            >
              {v.thumbnail_url ? (
                <img
                  src={v.thumbnail_url}
                  alt=""
                  className="w-full h-full object-cover group-active:scale-105 transition duration-200"
                />
              ) : (
                <video
                  src={v.video_url}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              )}

              {/* gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

              {/* stats */}
              <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1">
                <span className="text-[10px] font-semibold text-white drop-shadow">
                  ♥ {v.likes_count}
                </span>
                <span className="text-[10px] font-semibold text-white drop-shadow">
                  ▶ {v.views_count || 0}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

       <BottomNav />
    </div>
  )
}

export default function SoundPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <SoundContent />
    </Suspense>
  )
}