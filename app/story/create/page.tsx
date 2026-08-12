'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { insertNotification } from '@/lib/notify'

const STORY_FILTERS = [
  { id: 'none', label: 'Normal', css: 'none' },
  { id: 'bw', label: 'B&W', css: 'grayscale(1)' },
  { id: 'sepia', label: 'Sepia', css: 'sepia(0.85)' },
  { id: 'warm', label: 'Warm', css: 'sepia(0.35) saturate(1.35)' },
  { id: 'cool', label: 'Cool', css: 'hue-rotate(195deg) saturate(1.15)' },
  { id: 'vivid', label: 'Vivid', css: 'contrast(1.2) saturate(1.45)' },
  { id: 'soft', label: 'Soft', css: 'brightness(1.08) contrast(0.92)' },
] as const

function extractMentions(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9._]+)/g) || []
  return [...new Set(matches.map((m) => m.slice(1)))]
}

async function notifyMentions(
  supabase: ReturnType<typeof createClient>,
  opts: {
    text: string
    actorId: string
    videoId: string | null
  }
) {
  const usernames = extractMentions(opts.text)
  if (usernames.length === 0) return

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('username', usernames)

  if (!profiles?.length) return

  const rows = profiles
    .filter((p) => p.id && p.id !== opts.actorId)
    .map((p) => ({
      user_id: p.id,
      actor_id: opts.actorId,
      type: 'mention',
      video_id: opts.videoId,
      message: opts.text.slice(0, 120),
      is_read: false,
    }))

  if (rows.length === 0) return
  for (const row of rows) {
    await insertNotification(supabase, {
      user_id: row.user_id,
      actor_id: row.actor_id,
      type: 'mention',
      video_id: row.video_id,
      message: row.message,
    })
  }
}

export default function StoryCreatePage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image')
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [caption, setCaption] = useState('')
  const [progress, setProgress] = useState(0)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionResults, setMentionResults] = useState<
    { id: string; username: string | null; full_name: string | null; avatar_url: string | null }[]
  >([])
  const [showMentions, setShowMentions] = useState(false)
  const [mentionLoading, setMentionLoading] = useState(false)
  const [camMode, setCamMode] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [storyFilter, setStoryFilter] = useState<string>('none')
  const [camError, setCamError] = useState('')
  const [camReady, setCamReady] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const activeFilterCss =
    STORY_FILTERS.find((f) => f.id === storyFilter)?.css || 'none'

  const stopCam = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCamReady(false)
  }

  useEffect(() => {
    if (!camMode) return
    let cancelled = false

    const start = async () => {
      setCamError('')
      setCamReady(false)
      stopCam()
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1080 },
            height: { ideal: 1920 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r()))
        )
        const el = videoRef.current
        if (el) {
          el.srcObject = stream
          el.muted = true
          el.playsInline = true
          await el.play().catch(() => {})
          if (!cancelled) setCamReady(true)
        }
      } catch {
        if (!cancelled) {
          setCamError('Izinkan kamera di browser')
          setCamReady(false)
        }
      }
    }

    void start()
    return () => {
      cancelled = true
      stopCam()
    }
  }, [camMode, facingMode])

  const capturePhoto = async () => {
    const el = videoRef.current
    if (!el || !camReady) return

    const w = el.videoWidth
    const h = el.videoHeight
    if (!w || !h) return

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // mirror depan biar sama preview
    if (facingMode === 'user') {
      ctx.translate(w, 0)
      ctx.scale(-1, 1)
    }
    ctx.filter = activeFilterCss
    ctx.drawImage(el, 0, 0, w, h)
    ctx.filter = 'none'

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
    )
    if (!blob) return

    const f = new File([blob], `story-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    })
    stopCam()
    setCamMode(false)
    setMediaType('image')
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setMessage('')
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 40 * 1024 * 1024) {
      setMessage('Maksimal 40MB')
      return
    }
    const isVideo = f.type.startsWith('video/')
    setMediaType(isVideo ? 'video' : 'image')
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setMessage('')
  }

  const searchMentions = async (q: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    setMentionLoading(true)

    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)

    const ids = follows?.map((f) => f.following_id) || []
    if (ids.length === 0) {
      setMentionResults([])
      setMentionLoading(false)
      return
    }

    let query = supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', ids)
      .limit(8)

    if (q.trim()) {
      query = query.or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
    }

    const { data } = await query
    setMentionResults(data || [])
    setMentionLoading(false)
  }

  const insertMention = (username: string) => {
    if (!username) return
    setCaption((prev) => prev.replace(/@([a-zA-Z0-9._]*)$/, `@${username} `))
    setShowMentions(false)
    setMentionQuery('')
    setMentionResults([])
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setMessage('')
    setProgress(0)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/login')
        return
      }

      const ext =
        file.name.split('.').pop() || (mediaType === 'video' ? 'mp4' : 'jpg')
      const path = `${user.id}/${Date.now()}.${ext}`

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!supabaseUrl || !anonKey) {
        throw new Error('Konfigurasi Supabase belum lengkap')
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${supabaseUrl}/storage/v1/object/stories/${path}`)
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`)
        xhr.setRequestHeader('apikey', anonKey)
        xhr.setRequestHeader('x-upsert', 'false')

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100))
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else {
            try {
              const err = JSON.parse(xhr.responseText)
              reject(new Error(err.message || 'Gagal upload file'))
            } catch {
              reject(new Error('Gagal upload file'))
            }
          }
        }
        xhr.onerror = () => reject(new Error('Jaringan error saat upload'))
        xhr.send(file)
      })

      setProgress(100)

      const {
        data: { publicUrl },
      } = supabase.storage.from('stories').getPublicUrl(path)

      const { error: dbErr } = await supabase.from('stories').insert({
        user_id: user.id,
        media_url: publicUrl,
        media_type: mediaType,
        caption: caption.trim() || null,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })

      if (dbErr) throw dbErr

      if (caption.trim()) {
        await notifyMentions(supabase, {
          text: caption.trim(),
          actorId: user.id,
          videoId: null,
        })
      }

      setMessage('Story berhasil diposting!')
      setTimeout(() => router.push('/'), 800)
    } catch (err: any) {
      setMessage(err.message || 'Gagal upload')
      setProgress(0)
    } finally {
      setUploading(false)
    }
  }

  if (camMode) {
    return (
      <div className="fixed inset-0 bg-black text-white z-50">
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover ${
            facingMode === 'user' ? 'scale-x-[-1]' : ''
          }`}
          style={{ filter: activeFilterCss }}
          muted
          playsInline
          autoPlay
        />
        {!camReady && (
          <div className="absolute inset-0 bg-zinc-950 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}

        <div className="relative z-10 flex items-center justify-between px-4 pt-4">
          <button
            type="button"
            onClick={() => {
              stopCam()
              setCamMode(false)
            }}
            className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center"
          >
            ✕
          </button>
          <p className="text-sm font-semibold">Foto Story</p>
          <button
            type="button"
            onClick={() =>
              setFacingMode((f) => (f === 'user' ? 'environment' : 'user'))
            }
            className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center"
          >
            🔄
          </button>
        </div>

        {camError && (
          <p className="relative z-10 text-center text-xs text-red-400 mt-2 px-4">
            {camError}
          </p>
        )}

        {/* efek */}
        <div className="absolute bottom-36 left-0 right-0 z-10 px-3">
          <div className="flex gap-2 overflow-x-auto pb-1 justify-center">
            {STORY_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStoryFilter(f.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${
                  storyFilter === f.id
                    ? 'bg-vezao-gradient text-white'
                    : 'bg-black/50 border border-white/20 text-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="absolute bottom-10 left-0 right-0 z-10 flex justify-center">
          <button
            type="button"
            onClick={() => void capturePhoto()}
            disabled={!camReady}
            className="w-18 h-18 w-16 h-16 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-40"
          >
            <div className="w-12 h-12 rounded-full bg-white" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="h-14 flex items-center justify-between px-4 border-b border-white/10">
        <button onClick={() => router.back()} className="text-sm text-gray-300">
          Batal
        </button>
        <h1 className="font-semibold">Buat Story</h1>
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="text-sm font-semibold text-pink-400 disabled:opacity-40"
        >
          {uploading ? '...' : 'Bagikan'}
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
        {preview ? (
          mediaType === 'video' ? (
            <video
              src={preview}
              className="max-h-[70vh] w-full object-contain rounded-xl"
              controls
              playsInline
            />
          ) : (
            <img
              src={preview}
              alt=""
              className="max-h-[70vh] w-full object-contain rounded-xl"
            />
          )
        ) : (
          <div className="w-full max-w-sm space-y-3">
            <button
              type="button"
              onClick={() => setCamMode(true)}
              className="w-full aspect-[9/16] max-h-[45vh] rounded-2xl bg-zinc-900 border border-white/10 flex flex-col items-center justify-center gap-2"
            >
              <span className="text-3xl">📷</span>
              <span className="text-sm font-medium">Ambil foto</span>
              <span className="text-xs text-gray-500">Kamera + efek</span>
            </button>

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full py-3.5 rounded-2xl bg-zinc-900 border border-white/10 text-sm font-medium"
            >
              Pilih dari galeri (foto / video)
            </button>
            <p className="text-center text-xs text-gray-600">
              Maks 40MB · hilang 24 jam
            </p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={onPick}
        />

        {preview && (
          <div className="w-full max-w-sm space-y-3">
            <div className="relative">
              <textarea
                value={caption}
                onChange={(e) => {
                  const val = e.target.value.slice(0, 120)
                  setCaption(val)
                  const upToCursor = val.slice(
                    0,
                    e.target.selectionStart || val.length
                  )
                  const match = upToCursor.match(/@([a-zA-Z0-9._]*)$/)
                  if (match) {
                    setMentionQuery(match[1] || '')
                    setShowMentions(true)
                    void searchMentions(match[1] || '')
                  } else {
                    setShowMentions(false)
                    setMentionQuery('')
                  }
                }}
                placeholder="Tambah caption... @teman"
                rows={2}
                className="w-full bg-zinc-900 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-pink-500 resize-none"
              />
              <p className="text-[11px] text-gray-500 text-right mt-1">
                {caption.length}/120
              </p>

              {showMentions && (
                <div className="mt-1 rounded-xl border border-white/10 bg-zinc-900 overflow-hidden max-h-48 overflow-y-auto z-20">
                  {mentionLoading ? (
                    <p className="text-xs text-gray-500 px-3 py-2">Mencari...</p>
                  ) : mentionResults.length === 0 ? (
                    <p className="text-xs text-gray-500 px-3 py-2">
                      Tidak ada teman yang cocok
                    </p>
                  ) : (
                    mentionResults.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => insertMention(u.username || '')}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 text-left"
                      >
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700 shrink-0">
                          {u.avatar_url ? (
                            <img
                              src={u.avatar_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs font-bold bg-vezao-gradient">
                              {(u.username || 'U')[0]?.toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {u.full_name || u.username}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            @{u.username}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                setFile(null)
                setPreview(null)
                setCaption('')
              }}
              className="w-full text-sm text-gray-400 py-1"
            >
              Ganti file
            </button>
          </div>
        )}

        {uploading && (
          <div className="w-full max-w-sm space-y-2 px-1">
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-vezao-gradient transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-center text-gray-400">
              Mengupload... {progress}%
            </p>
          </div>
        )}

        {message && (
          <p
            className={`text-sm text-center ${
              message.includes('berhasil') ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  )
}