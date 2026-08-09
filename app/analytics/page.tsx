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
  const engagement =
    totals.views > 0
      ? ((totals.likes + totals.comments + totals.saves + totals.shares) /
          totals.views) *
        100
      : 0
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
    <div className="h-[100dvh] overflow-y-auto overscroll-y-contain bg-black text-white pb-24">
      <div className="sticky top-0 z-40 bg-[#0b0614]/95 backdrop-blur-md border-b border-purple-500/20 px-4 h-14 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-lg font-bold text-pink-300">
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

      <div className="px-4 mt-6 mb-4">
        <p className="text-sm font-semibold text-pink-400/80 mb-3">
          Semua video ({filtered.length})
        </p>
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-6">Tidak ada video di rentang ini</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((v) => {
              const views = v.views_count || 0
              const eng =
                views > 0
                  ? (
                      ((v.likes_count +
                        (v.comments_count || 0) +
                        (v.saves_count || 0) +
                        (v.shares_count || 0)) /
                        views) *
                      100
                    ).toFixed(1)
                  : '0.0'
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => router.push(`/v/${v.id}`)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/90 border border-purple-500/15 active:bg-purple-500/5 text-left"
                >
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
                    <p className="text-sm line-clamp-1">
                      {v.caption || 'Tanpa caption'}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                      ▶ {views.toLocaleString('id-ID')} · ♥{' '}
                      {(v.likes_count || 0).toLocaleString('id-ID')} · 💬{' '}
                      {(v.comments_count || 0).toLocaleString('id-ID')}
                      <br />
                      🔖 {(v.saves_count || 0).toLocaleString('id-ID')} · ↗{' '}
                      {(v.shares_count || 0).toLocaleString('id-ID')} · ER {eng}%
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}