'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { toast } from '@/lib/toast'

type HistoryItem = {
  video_id: string
  watch_ms: number | null
  completed: boolean | null
  updated_at?: string
  videos: {
    id: string
    caption: string | null
    thumbnail_url: string | null
    video_url: string
    views_count: number | null
    profiles: {
      username: string | null
      avatar_url: string | null
    } | null
  } | null
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const load = async (uid: string) => {
    const { data, error } = await supabase
      .from('video_views')
      .select(
        `
        video_id,
        watch_ms,
        completed,
        videos (
          id,
          caption,
          thumbnail_url,
          video_url,
          views_count,
          profiles ( username, avatar_url )
        )
      `
      )
      .eq('user_id', uid)
      .order('watch_ms', { ascending: false })
      .limit(80)

    if (error) {
      console.error(error)
      setItems([])
    } else {
      setItems((data as any) || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setUserId(user.id)
      await load(user.id)
    }
    init()
  }, [])

  const clearAll = async () => {
    if (!userId) return
    if (!confirm('Hapus semua riwayat tonton?')) return
    const { error } = await supabase.from('video_views').delete().eq('user_id', userId)
    if (error) {
      toast('Gagal hapus: ' + error.message, 'error')
      return
    }
    setItems([])
    toast('Riwayat dihapus', 'success')
  }

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      <div className="w-full max-w-[480px] mx-auto min-h-screen border-x border-white/5">
        <div className="sticky top-0 z-20 bg-black/95 border-b border-white/10 px-4 h-12 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-300"
          >
            ‹ Kembali
          </button>
          <h1 className="text-sm font-semibold">Riwayat tonton</h1>
          <button
            onClick={clearAll}
            disabled={items.length === 0}
            className="text-xs text-red-400 disabled:opacity-30"
          >
            Hapus
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center pt-20 px-6 text-center">
            <p className="text-3xl mb-3">👁</p>
            <p className="text-sm font-semibold mb-1">Belum ada riwayat</p>
            <p className="text-xs text-gray-500">
              Video yang kamu tonton akan muncul di sini
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {items.map((row) => {
              const v = row.videos
              if (!v) return null
              const sec = Math.round((row.watch_ms || 0) / 1000)
              return (
                <button
                  key={row.video_id}
                  type="button"
                  onClick={() => router.push(`/v/${v.id}`)}
                  className="w-full flex gap-3 px-4 py-3 text-left active:bg-white/5"
                >
                  <div className="w-14 h-20 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
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
                  <div className="flex-1 min-w-0 py-0.5">
                    <p className="text-sm line-clamp-2">
                      {v.caption || 'Tanpa caption'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      @{v.profiles?.username || 'user'}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {row.completed ? 'Selesai ditonton' : `Ditonton ~${sec}d`}
                      {typeof v.views_count === 'number'
                        ? ` · ▶ ${v.views_count}`
                        : ''}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <BottomNav />
      </div>
    </div>
  )
}