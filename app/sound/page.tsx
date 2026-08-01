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
      <div className="sticky top-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/10 px-4 h-14 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-lg font-bold">
          ←
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-400">Sound</p>
          <p className="text-sm font-semibold truncate">🎵 {name}</p>
        </div>
        <button
          onClick={() =>
            router.push(`/upload?sound=${encodeURIComponent(name.trim())}`)
          }
          className="shrink-0 text-xs font-semibold bg-vezao-gradient px-3 py-1.5 rounded-full"
        >
          Gunakan
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      ) : videos.length === 0 ? (
        <p className="text-center text-gray-500 py-16 text-sm">
          Belum ada video dengan sound ini
        </p>
      ) : (
        <>
          <p className="px-4 py-3 text-xs text-gray-400">
            {videos.length} video
          </p>
          <div className="grid grid-cols-3 gap-[2px] px-1">
            {videos.map((v) => (
              <div
                key={v.id}
                onClick={() => router.push(`/v/${v.id}`)}
                className="aspect-[9/16] bg-zinc-900 relative overflow-hidden cursor-pointer"
              >
                {v.thumbnail_url ? (
                  <img
                    src={v.thumbnail_url}
                    alt=""
                    className="w-full h-full object-cover"
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
                <div className="absolute bottom-1 left-1 text-[10px] text-white bg-black/50 rounded px-1">
                  ♥ {v.likes_count}
                </div>
              </div>
            ))}
          </div>
        </>
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