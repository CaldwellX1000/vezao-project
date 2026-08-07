'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

type VideoRow = {
  id: string
  caption: string | null
  thumbnail_url: string | null
  video_url: string
  likes_count: number
  comments_count: number
  views_count: number | null
  saves_count: number | null
  shares_count: number | null
  created_at: string
  is_draft: boolean | null
}

type Range = 'all' | '7d' | '30d'

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<Range>('all')
  const [videos, setVideos] = useState<VideoRow[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
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
          'id, caption, thumbnail_url, video_url, likes_count, comments_count, views_count, saves_count, shares_count, created_at, is_draft'
        )
        .eq('user_id', user.id)
        .eq('is_draft', false)
        .order('created_at', { ascending: false })

      setVideos((data as any) || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = videos.filter((v) => {
    if (range === 'all') return true
    const age = Date.now() - new Date(v.created_at).getTime()
    const days = range === '7d' ? 7 : 30
    return age <= days * 24 * 60 * 60 * 1000
  })

  const sum = (key: keyof VideoRow) =>
    filtered.reduce((s, v) => s + (Number(v[key]) || 0), 0)

  const totals = {
    videos: filtered.length,
    views: sum('views_count'),
    likes: sum('likes_count'),
    comments: sum('comments_count'),
    saves: sum('saves_count'),
    shares: sum('shares_count'),
  }

  const topVideos = [...filtered]
    .sort((a, b) => (b.views_count || 0) - (a.views_count || 0))
    .slice(0, 5)

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="sticky top-0 z-40 bg-[#0b0614]/95 backdrop-blur-md border-b border-purple-500/20 px-4 h-14 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-lg font-bold text-purple-300">
          ←
        </button>
        <h1 className="font-semibold">Analytics</h1>
      </div>

      <div className="px-4 pt-4 flex gap-2">
        {(
          [
            { id: 'all', label: 'Semua' },
            { id: '7d', label: '7 hari' },
            { id: '30d', label: '30 hari' },
          ] as { id: Range; label: string }[]
        ).map((r) => (
          <button
            key={r.id}
            onClick={() => setRange(r.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              range === r.id
                ? 'bg-vezao-gradient text-white'
                : 'bg-zinc-800 text-gray-400'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="px-4 mt-4 grid grid-cols-2 gap-2">
        {[
          { label: 'Views', value: totals.views },
          { label: 'Likes', value: totals.likes },
          { label: 'Komentar', value: totals.comments },
          { label: 'Save', value: totals.saves },
          { label: 'Share', value: totals.shares },
          { label: 'Video', value: totals.videos },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl bg-zinc-900/90 border border-purple-500/15 p-4"
          >
            <p className="text-xs text-gray-400">{card.label}</p>
            <p className="text-2xl font-bold mt-1">
              {card.value.toLocaleString('id-ID')}
            </p>
          </div>
        ))}
      </div>

      <div className="px-4 mt-6">
        <p className="text-sm font-semibold text-purple-400/80 mb-3">Top video</p>
        {topVideos.length === 0 ? (
          <div className="flex flex-col items-center py-12 px-6 text-center">
            <div className="w-14 h-14 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-3 text-xl">
              📊
            </div>
            <p className="text-sm font-medium text-white">Belum ada data</p>
            <p className="text-xs text-gray-500 mt-1">Upload video untuk lihat analytics</p>
          </div>
        ) : (
          <div className="space-y-2">
            {topVideos.map((v, i) => (
              <button
                key={v.id}
                onClick={() => router.push(`/v/${v.id}`)}
                className="w-full flex items-center gap-3 p-2 rounded-xl bg-zinc-900/90 border border-purple-500/15 active:bg-purple-500/5 text-left"
              >
                <span className="text-sm text-gray-500 w-5 text-center">
                  {i + 1}
                </span>
                <div className="w-12 h-16 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
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
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm line-clamp-2">
                    {v.caption || 'Tanpa caption'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    ▶ {(v.views_count || 0).toLocaleString('id-ID')} · ♥{' '}
                    {(v.likes_count || 0).toLocaleString('id-ID')}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}