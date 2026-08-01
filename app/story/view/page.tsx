'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'

type Story = {
  id: string
  user_id: string
  media_url: string
  media_type: string | null
  created_at: string
  caption?: string | null
  profiles?: {
    username: string | null
    avatar_url: string | null
    full_name: string | null
  } | null
}

type Viewer = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  viewed_at: string
}

function formatStoryTime(dateStr: string) {
  const d = new Date(dateStr)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'Baru saja'
  if (min < 60) return `${min}m`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}j`
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function StoryViewContent() {
  const searchParams = useSearchParams()
  const userId = searchParams.get('userId') || searchParams.get('u')
  const router = useRouter()
  const supabase = createClient()

  const [stories, setStories] = useState<Story[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [queue, setQueue] = useState<string[]>([]) // user_id yang punya story aktif
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [showReply, setShowReply] = useState(false)
  const [viewCount, setViewCount] = useState(0)
  const [viewers, setViewers] = useState<Viewer[]>([])
  const [showViewers, setShowViewers] = useState(false)
  const [loadingViewers, setLoadingViewers] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef = useRef<number>(0)
  const elapsedRef = useRef<number>(0)
  const DURATION = 5000
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)

  // Queue: story sendiri + yang kita follow saja
  useEffect(() => {
    const loadQueue = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)

      const followingIds = (follows || []).map((f) => f.following_id)
      const allowed = new Set<string>([user.id, ...followingIds])

      const { data } = await supabase
        .from('stories')
        .select('user_id')
        .gt('expires_at', new Date().toISOString())

      const ids = [
        ...new Set(
          (data || [])
            .map((s) => s.user_id)
            .filter((id) => allowed.has(id))
        ),
      ]

      // Story sendiri di depan (opsional)
      ids.sort((a, b) => {
        if (a === user.id) return -1
        if (b === user.id) return 1
        return 0
      })

      setQueue(ids)
    }
    loadQueue()
  }, [])

  useEffect(() => {
    const load = async () => {
      if (!userId) {
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
      setCurrentUserId(user.id)
      setIndex(0)
      setProgress(0)
      elapsedRef.current = 0
      setLoading(true)

      const { data, error } = await supabase
        .from('stories')
        .select(
          `
          id, user_id, media_url, media_type, created_at, caption,
          profiles ( username, avatar_url, full_name )
        `
        )
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true })

      if (error) {
        console.error(error)
        setLoading(false)
        return
      }

      setStories((data as any) || [])
      setLoading(false)
    }

    load()
  }, [userId])

  // Tandai dilihat
  useEffect(() => {
    if (!currentUserId || stories.length === 0) return
    const s = stories[index]
    if (!s) return
    ;(async () => {
      const { error } = await supabase.from('story_views').upsert(
        { story_id: s.id, viewer_id: currentUserId },
        { onConflict: 'story_id,viewer_id' }
      )
      if (error) {
        const { error: err2 } = await supabase.from('story_views').insert({
          story_id: s.id,
          viewer_id: currentUserId,
        })
        if (err2 && err2.code !== '23505') {
          console.error('story_views insert:', err2)
        }
      }
    })()
  }, [index, stories, currentUserId])

  // Count viewer
  useEffect(() => {
    if (!currentUserId || stories.length === 0) return
    const s = stories[index]
    if (!s || s.user_id !== currentUserId) {
      setViewCount(0)
      return
    }
    const loadCount = async () => {
      const { count } = await supabase
        .from('story_views')
        .select('*', { count: 'exact', head: true })
        .eq('story_id', s.id)
      setViewCount(count || 0)
    }
    loadCount()
  }, [index, stories, currentUserId])

  const from = searchParams.get('from') // 'inbox' | null
  const exitStory = () => {
    if (from === 'inbox') router.push('/inbox')
    else router.push('/')
  }

  const goToNextUserOrBack = () => {
    if (!userId || queue.length === 0) {
      exitStory()
      return
    }
    const idx = queue.indexOf(userId)
    for (let i = idx + 1; i < queue.length; i++) {
      if (queue[i] !== userId) {
        const q = from ? `&from=${from}` : ''
        router.replace(`/story/view?userId=${queue[i]}${q}`)
        return
      }
    }
    exitStory()
  }

  // Progress + auto next
  // Foto: 5 detik | Video: ikut durasi video
  useEffect(() => {
    if (loading || stories.length === 0) return

    const s = stories[index]
    if (!s) return

    const mediaIsVideo =
      s.media_type?.startsWith('video') ||
      s.media_url?.includes('.mp4') ||
      s.media_url?.includes('video')

    // --- VIDEO: progress dari currentTime / duration ---
    if (mediaIsVideo) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }

      const tick = () => {
        const v = videoRef.current
        if (!v || paused) return
        if (!v.duration || !isFinite(v.duration)) return
        const p = Math.min(100, (v.currentTime / v.duration) * 100)
        setProgress(p)
        if (p >= 99.5) {
          elapsedRef.current = 0
          setIndex((i) => {
            if (i >= stories.length - 1) {
              goToNextUserOrBack()
              return i
            }
            return i + 1
          })
        }
      }

      timerRef.current = setInterval(tick, 80)
      return () => {
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }

    // --- FOTO: 5 detik ---
    if (paused) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }

    startRef.current = Date.now()
    const base = elapsedRef.current

    timerRef.current = setInterval(() => {
      const elapsed = base + (Date.now() - startRef.current)
      const p = Math.min(100, (elapsed / DURATION) * 100)
      setProgress(p)
      if (p >= 100) {
        elapsedRef.current = 0
        if (timerRef.current) clearInterval(timerRef.current)
        setIndex((i) => {
          if (i >= stories.length - 1) {
            goToNextUserOrBack()
            return i
          }
          return i + 1
        })
      }
    }, 50)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [index, loading, stories, paused, userId, queue])

  // Reset elapsed saat ganti slide
  useEffect(() => {
    elapsedRef.current = 0
    setProgress(0)
  }, [index, userId])

  const onHoldStart = () => {
    elapsedRef.current = (progress / 100) * DURATION
    setPaused(true)
    videoRef.current?.pause()
  }

  const onHoldEnd = () => {
    setPaused(false)
    videoRef.current?.play().catch(() => {})
  }

  const goNext = () => {
    elapsedRef.current = 0
    if (index >= stories.length - 1) goToNextUserOrBack()
    else setIndex((i) => i + 1)
  }

  const goPrev = () => {
    elapsedRef.current = 0
    if (index <= 0) return
    setIndex((i) => i - 1)
  }

  const openViewers = async () => {
    const s = stories[index]
    if (!s || s.user_id !== currentUserId) return
    setShowViewers(true)
    setLoadingViewers(true)

    const { data: views } = await supabase
      .from('story_views')
      .select('viewer_id, created_at')
      .eq('story_id', s.id)
      .order('created_at', { ascending: false })

    if (!views || views.length === 0) {
      setViewers([])
      setLoadingViewers(false)
      return
    }

    const ids = views.map((v) => v.viewer_id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', ids)

    const map = new Map((profiles || []).map((p) => [p.id, p]))
    setViewers(
      views.map((v) => {
        const p = map.get(v.viewer_id)
        return {
          id: v.viewer_id,
          username: p?.username || null,
          full_name: p?.full_name || null,
          avatar_url: p?.avatar_url || null,
          viewed_at: v.created_at,
        }
      })
    )
    setLoadingViewers(false)
  }

  const deleteStory = async () => {
    const s = stories[index]
    if (!s || s.user_id !== currentUserId) return
    if (!confirm('Hapus story ini?')) return
    const { error } = await supabase.from('stories').delete().eq('id', s.id)
    if (error) {
      alert('Gagal hapus: ' + error.message)
      return
    }
    const next = stories.filter((_, i) => i !== index)
    if (next.length === 0) {
      goToNextUserOrBack()
      return
    }
    setStories(next)
    setIndex((i) => Math.min(i, next.length - 1))
  }

  const sendReply = async () => {
    if (!replyText.trim() || !currentUserId) return
    const s = stories[index]
    if (!s || s.user_id === currentUserId) return
    setSendingReply(true)
    const { error } = await supabase.from('messages').insert({
      sender_id: currentUserId,
      receiver_id: s.user_id,
      content: `__STORY__:${s.id}\n${replyText.trim()}`,
      is_read: false,
    })
    setSendingReply(false)
    if (error) {
      alert('Gagal kirim: ' + error.message)
      return
    }
    setReplyText('')
    setShowReply(false)
    alert('Balasan terkirim ke inbox')
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  if (stories.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-3 text-white">
        <p className="text-sm text-gray-400">Tidak ada story</p>
        <button onClick={() => router.back()} className="text-sm text-purple-400">
          Kembali
        </button>
      </div>
    )
  }

  const story = stories[index]
  const isVideo =
    story.media_type?.startsWith('video') ||
    story.media_url?.includes('.mp4') ||
    story.media_url?.includes('video')
  const isOwn = story.user_id === currentUserId

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      <div className="relative w-full max-w-[480px] h-full bg-black overflow-hidden">
        {/* Gradient atas */}
        <div className="absolute top-0 left-0 right-0 h-28 z-20 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />

        {/* Progress */}
        <div className="absolute top-2 left-2 right-2 z-30 flex gap-1">
          {stories.map((_, i) => (
            <div
              key={i}
              className="h-0.5 flex-1 rounded-full bg-white/30 overflow-hidden"
            >
              <div
                className="h-full bg-white transition-all duration-75"
                style={{
                  width: i < index ? '100%' : i === index ? `${progress}%` : '0%',
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-5 left-0 right-0 z-30 flex items-center gap-2 px-3 pt-2 pointer-events-none">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700 border border-white/20 pointer-events-auto">
            {story.profiles?.avatar_url ? (
              <img
                src={story.profiles.avatar_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs font-bold bg-vezao-gradient">
                {(story.profiles?.username || 'U')[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white truncate">
                @{story.profiles?.username || 'user'}
              </p>
              {isOwn && (
                <button
                  type="button"
                  onClick={openViewers}
                  className="flex items-center gap-0.5 text-xs text-white/70 shrink-0 pointer-events-auto"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                  {viewCount}
                </button>
              )}
            </div>
            <p className="text-[11px] text-white/50 mt-0.5">
              {formatStoryTime(story.created_at)}
            </p>
          </div>
          {isOwn && (
            <button
              onClick={deleteStory}
              className="text-xs text-red-400 px-2 font-medium pointer-events-auto"
            >
              Hapus
            </button>
          )}
          <button
            onClick={exitStory}
            className="w-8 h-8 flex items-center justify-center text-white text-xl pointer-events-auto"
          >
            ✕
          </button>
        </div>

        {/* Media + hold to pause */}
        <div
          className="absolute inset-0"
          onMouseDown={onHoldStart}
          onMouseUp={onHoldEnd}
          onMouseLeave={onHoldEnd}
          onTouchStart={onHoldStart}
          onTouchEnd={onHoldEnd}
          onTouchCancel={onHoldEnd}
        >
          {isVideo ? (
            <video
              key={story.id}
              ref={videoRef}
              src={story.media_url}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              autoPlay
              playsInline
              muted={false}
              onEnded={goNext}
            />
          ) : (
            <img
              key={story.id}
              src={story.media_url}
              alt=""
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
          )}
        </div>

        {/* Caption */}
        {story.caption && (
          <div
            className={`absolute left-0 right-0 z-30 px-4 pointer-events-none ${
              isOwn ? 'bottom-10' : 'bottom-24'
            }`}
          >
            <p className="text-sm text-white leading-snug drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] line-clamp-3">
              <span className="font-semibold">
                @{story.profiles?.username || 'user'}{' '}
              </span>
              <span className="font-normal text-white/95">{story.caption}</span>
            </p>
          </div>
        )}

        {/* Reply */}
        {!isOwn && (
          <div className="absolute bottom-6 left-3 right-3 z-30">
            {showReply ? (
              <div className="flex gap-2">
                <input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendReply()}
                  placeholder="Balas story..."
                  className="flex-1 bg-black/50 border border-white/20 rounded-full px-4 py-2.5 text-sm text-white placeholder:text-gray-400 focus:outline-none"
                  autoFocus
                />
                <button
                  onClick={sendReply}
                  disabled={sendingReply || !replyText.trim()}
                  className="bg-vezao-gradient px-4 py-2 rounded-full text-sm font-medium disabled:opacity-50"
                >
                  Kirim
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowReply(true)}
                className="w-full text-left bg-black/40 border border-white/20 rounded-full px-4 py-2.5 text-sm text-gray-300"
              >
                Balas story...
              </button>
            )}
          </div>
        )}

        {/* Tap zones (tap = next/prev, hold di media = pause) */}
        <button
          type="button"
          className="absolute left-0 top-0 bottom-0 w-1/3 z-20"
          onClick={goPrev}
          aria-label="Prev"
        />
        <button
          type="button"
          className="absolute right-0 top-0 bottom-0 w-1/3 z-20"
          onClick={goNext}
          aria-label="Next"
        />

        {showViewers && (
          <div className="absolute inset-0 z-50 flex items-end">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setShowViewers(false)}
            />
            <div className="relative w-full bg-zinc-900 rounded-t-2xl max-h-[60%] flex flex-col">
              <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mt-3 mb-2" />
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
                <p className="font-semibold text-sm">Dilihat oleh {viewCount}</p>
                <button
                  onClick={() => setShowViewers(false)}
                  className="text-gray-400 text-lg"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-2 py-2">
                {loadingViewers ? (
                  <p className="text-center text-gray-500 text-sm py-8">Loading...</p>
                ) : viewers.length === 0 ? (
                  <p className="text-center text-gray-500 text-sm py-8">
                    Belum ada yang melihat
                  </p>
                ) : (
                  viewers.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setShowViewers(false)
                        router.push(`/@${v.username || v.id}`)
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5"
                    >
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-700 shrink-0">
                        {v.avatar_url ? (
                          <img
                            src={v.avatar_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm font-bold bg-vezao-gradient">
                            {(v.username || 'U')[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {v.full_name || v.username || 'user'}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          @{v.username || 'user'} · {formatStoryTime(v.viewed_at)}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function StoryViewPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 bg-black flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <StoryViewContent />
    </Suspense>
  )
}