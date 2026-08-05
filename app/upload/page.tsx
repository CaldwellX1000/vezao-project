'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'

type Mode = 'choose' | 'gallery' | 'camera' | 'preview'

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
  await supabase.from('notifications').insert(rows)
}
/** Compress ke max lebar 720px, bitrate ~2.5Mbps. Gagal → file asli. */
async function compressVideo(
  file: File,
  onProgress?: (pct: number) => void
): Promise<File> {
  // Sudah kecil → skip
  if (file.size < 6 * 1024 * 1024) {
    onProgress?.(100)
    return file
  }

  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    const url = URL.createObjectURL(file)
    video.src = url

    const fail = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }

    video.onerror = fail

    video.onloadedmetadata = async () => {
      try {
        let w = video.videoWidth
        let h = video.videoHeight
        if (!w || !h) {
          fail()
          return
        }

        const maxW = 720
        if (w > maxW) {
          h = Math.round((h * maxW) / w)
          w = maxW
        }

        // Sudah ≤720p dan tidak terlalu besar
        if (video.videoWidth <= 720 && file.size < 12 * 1024 * 1024) {
          URL.revokeObjectURL(url)
          onProgress?.(100)
          resolve(file)
          return
        }

        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          fail()
          return
        }

        const canvasStream = canvas.captureStream(30)

        // Coba ambil audio dari video asli
        try {
          const raw: MediaStream | undefined =
            (video as any).captureStream?.() ||
            (video as any).mozCaptureStream?.()
          raw?.getAudioTracks().forEach((t) => canvasStream.addTrack(t))
        } catch {
          /* tanpa audio tetap oke */
        }

        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : 'video/webm'

        const recorder = new MediaRecorder(canvasStream, {
          mimeType: mime,
          videoBitsPerSecond: 2_500_000,
        })
        const chunks: Blob[] = []

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data)
        }

        recorder.onstop = () => {
          canvasStream.getTracks().forEach((t) => t.stop())
          URL.revokeObjectURL(url)
          const blob = new Blob(chunks, { type: mime })
          // Kalau hasil malah lebih besar, pakai asli
          if (blob.size === 0 || blob.size >= file.size * 0.98) {
            resolve(file)
            return
          }
          onProgress?.(100)
          resolve(
            new File([blob], `cicipy-${Date.now()}.webm`, { type: mime })
          )
        }

        recorder.start(200)
        video.currentTime = 0
        await video.play()

        const draw = () => {
          if (video.ended || video.paused) return
          ctx.drawImage(video, 0, 0, w, h)
          if (onProgress && video.duration) {
            onProgress(
              Math.min(90, Math.round((video.currentTime / video.duration) * 90))
            )
          }
          requestAnimationFrame(draw)
        }
        draw()

        video.onended = () => {
          try {
            recorder.stop()
          } catch {
            fail()
          }
        }
      } catch {
        fail()
      }
    }
  })
}

const VIDEO_FILTERS = [
  { id: 'none', label: 'Normal', css: 'none' },
  { id: 'bw', label: 'B&W', css: 'grayscale(1)' },
  { id: 'sepia', label: 'Sepia', css: 'sepia(0.85)' },
  { id: 'warm', label: 'Warm', css: 'sepia(0.35) saturate(1.35)' },
  { id: 'cool', label: 'Cool', css: 'hue-rotate(195deg) saturate(1.15)' },
  { id: 'vivid', label: 'Vivid', css: 'contrast(1.2) saturate(1.45)' },
  { id: 'soft', label: 'Soft', css: 'brightness(1.08) contrast(0.92)' },
] as const
function UploadContent() {
  const searchParams = useSearchParams()
  const draftId = searchParams.get('draft')

  const [mode, setMode] = useState<Mode>('choose')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [existingVideoUrl, setExistingVideoUrl] = useState<string | null>(null)
  const [existingThumbUrl, setExistingThumbUrl] = useState<string | null>(null)
  const [commentsEnabled, setCommentsEnabled] = useState(true)
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>('public')
  const [soundName, setSoundName] = useState('')
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionResults, setMentionResults] = useState<
    { id: string; username: string | null; full_name: string | null; avatar_url: string | null }[]
  >([])
  const [showMentions, setShowMentions] = useState(false)
    const [videoFilter, setVideoFilter] = useState<string>('none')
  const [mentionLoading, setMentionLoading] = useState(false)
    const [soundQuery, setSoundQuery] = useState('')
  const [soundResults, setSoundResults] = useState<string[]>([])
  const [showSoundSuggest, setShowSoundSuggest] = useState(false)
  const [soundLoading, setSoundLoading] = useState(false)

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [recording, setRecording] = useState(false)
  const [maxDuration, setMaxDuration] = useState<15 | 60>(15)
  const [elapsed, setElapsed] = useState(0)
  const [cameraError, setCameraError] = useState('')

  const [duration, setDuration] = useState(0)
  const [coverTime, setCoverTime] = useState(0)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/login')
        return
      }
      const soundParam = searchParams.get('sound')
      if (soundParam) {
        setSoundName(soundParam.slice(0, 80))
      }
      if (draftId) {
        const { data: draft } = await supabase
          .from('videos')
          .select('id, caption, video_url, thumbnail_url, is_draft, user_id, comments_enabled, visibility, sound_name')
          .eq('id', draftId)
          .single()

        if (draft && draft.user_id === session.user.id) {
          setEditingDraftId(draft.id)
          setExistingVideoUrl(draft.video_url)
          setExistingThumbUrl(draft.thumbnail_url)
          setPreview(draft.video_url)
          setCaption(draft.caption || '')
          setCoverPreview(draft.thumbnail_url)
          setCommentsEnabled(draft.comments_enabled !== false)
          setVisibility((draft.visibility as any) || 'public')
          setSoundName((draft as any).sound_name || '')
          setMode('preview')
        }
      }

      setCheckingAuth(false)
    }
    init()
  }, [draftId])

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    setExistingVideoUrl(null)
    setCoverPreview(null)
    setCoverTime(0)
    setDuration(0)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    return () => stopCamera()
  }, [])

  const stopCamera = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch {}
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setRecording(false)
    setElapsed(0)
  }

  const startCamera = async (facing: 'user' | 'environment' = facingMode) => {
    stopCamera()
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 720 },
          height: { ideal: 1280 },
        },
        audio: true,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setFacingMode(facing)
      setMode('camera')
    } catch (err: any) {
      setCameraError('Gagal akses kamera. Izinkan kamera & mikrofon di browser.')
    }
  }

  const flipCamera = () => {
    startCamera(facingMode === 'user' ? 'environment' : 'user')
  }

  const startRecording = () => {
    if (!streamRef.current || recording) return
    chunksRef.current = []
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : 'video/mp4'

    const recorder = new MediaRecorder(streamRef.current, { mimeType })
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const recordedFile = new File([blob], `serulo-${Date.now()}.webm`, { type: mimeType })
      setFile(recordedFile)
      setEditingDraftId(null)
      stopCamera()
      setMode('preview')
    }

    recorder.start(200)
    setRecording(true)
    setElapsed(0)

    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1
        if (next >= maxDuration) stopRecording()
        return next
      })
    }, 1000)
  }

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    setRecording(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null
    if (selected && selected.size > 100 * 1024 * 1024) {
      setMessage('Video maksimal 100MB')
      return
    }
    setFile(selected)
    setEditingDraftId(null)
    setMessage('')
    setMode('preview')
  }

  const captureFrameAt = (time: number): Promise<string | null> => {
    return new Promise((resolve) => {
      const v = previewVideoRef.current
      if (!v) {
        resolve(null)
        return
      }

      const doCapture = () => {
        try {
          const w = v.videoWidth
          const h = v.videoHeight
          if (!w || !h) {
            resolve(null)
            return
          }
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve(null)
            return
          }
          ctx.filter =
            VIDEO_FILTERS.find((f) => f.id === videoFilter)?.css || 'none'
          ctx.drawImage(v, 0, 0, w, h)
          ctx.filter = 'none'
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
          setCoverPreview(dataUrl)
          resolve(dataUrl)
        } catch {
          resolve(null)
        }
      }

      const target = Math.min(Math.max(time, 0.05), Math.max((v.duration || 1) - 0.05, 0.05))

      const onSeeked = () => {
        v.removeEventListener('seeked', onSeeked)
        // tunggu 1 frame biar gambar ready
        requestAnimationFrame(() => {
          requestAnimationFrame(doCapture)
        })
      }

      v.addEventListener('seeked', onSeeked)
      try {
        v.currentTime = target
      } catch {
        v.removeEventListener('seeked', onSeeked)
        doCapture()
      }
    })
  }

  const onPreviewLoaded = async () => {
    const v = previewVideoRef.current
    if (!v) return
    const d = v.duration || 0
    setDuration(d)

    // Ambil frame di 1s (atau tengah video pendek) — hindari frame hitam di 0s
    const autoTime = d > 1 ? 1 : Math.max(0.15, d * 0.3)
    setCoverTime(autoTime)

    // Auto cover kalau belum ada / masih data lokal
    if (!coverPreview || coverPreview.startsWith('data:')) {
      await captureFrameAt(autoTime)
    }
  }

  const onCoverChange = (value: number) => {
    setCoverTime(value)
    void captureFrameAt(value)
  }

  const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
    const res = await fetch(dataUrl)
    return res.blob()
  }

  const handleUpload = async (asDraft = false) => {
    if (editingDraftId && !file) {
      setUploading(true)
      setProgress(30)
      setMessage('')

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }

        let thumbnailUrl = existingThumbUrl

        let coverData = coverPreview
        if (!coverData || coverData === existingThumbUrl) {
          // coba generate dari video preview kalau user geser / belum ada
          if (previewVideoRef.current) {
            const t = coverTime || 1
            const generated = await captureFrameAt(t)
            if (generated) coverData = generated
          }
        }

        if (coverData && coverData.startsWith('data:')) {
          const thumbBlob = await dataUrlToBlob(coverData)
          const thumbName = `${user.id}/${Date.now()}.jpg`
          const { error: thumbError } = await supabase.storage
            .from('thumbnails')
            .upload(thumbName, thumbBlob, { contentType: 'image/jpeg' })

          if (!thumbError) {
            const { data: { publicUrl: tUrl } } = supabase.storage
              .from('thumbnails')
              .getPublicUrl(thumbName)
            thumbnailUrl = tUrl
          }
        }

        setProgress(70)

        const { error } = await supabase
          .from('videos')
          .update({
            caption: caption.trim() || null,
            thumbnail_url: thumbnailUrl,
            is_draft: asDraft,
            comments_enabled: commentsEnabled,
            visibility: visibility,
            sound_name:
  soundName.trim() ||
  `Original sound - @${(await supabase.from('profiles').select('username').eq('id', user.id).single()).data?.username || 'user'}`,
          })
          .eq('id', editingDraftId)
          .eq('user_id', user.id)

        if (error) throw error

        if (!asDraft && caption.trim()) {
          await notifyMentions(supabase, {
            text: caption.trim(),
            actorId: user.id,
            videoId: editingDraftId,
          })
        }

        setProgress(100)
        setMessage(asDraft ? 'Draft tersimpan!' : 'Upload berhasil!')
        setTimeout(() => {
          router.push('/profile')
          router.refresh()
        }, 800)
      } catch (err: any) {
        setMessage(err.message || 'Gagal')
        setProgress(0)
      } finally {
        setUploading(false)
      }
      return
    }

    if (!file) {
      setMessage('Pilih / rekam video dulu')
      return
    }

    setUploading(true)
    setProgress(5)
    setMessage('Menyiapkan video...')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Compress ke ~720p sebelum upload
      const uploadFile = await compressVideo(file, (pct) => {
        setProgress(Math.max(5, Math.min(40, Math.round(pct * 0.4))))
        setMessage('Menyiapkan video...')
      })

      const fileExt = uploadFile.name.split('.').pop() || 'webm'
      const fileName = `${user.id}/${Date.now()}.${fileExt}`

      setProgress(45)
      setMessage('Mengupload...')

      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(fileName, uploadFile)

      if (uploadError) throw uploadError

      setProgress(50)

      const { data: { publicUrl } } = supabase.storage
        .from('videos')
        .getPublicUrl(fileName)

      // Pastikan ada cover (otomatis kalau user tidak geser slider)
      let coverData = coverPreview
      if (!coverData || !coverData.startsWith('data:')) {
        const t = coverTime || (duration > 1 ? 1 : 0.15)
        coverData = await captureFrameAt(t)
      }

      let thumbnailUrl: string | null = null
        if (coverData && coverData.startsWith('data:')) {
        const thumbBlob = await dataUrlToBlob(coverData)
        const thumbName = `${user.id}/${Date.now()}.jpg`
        const { error: thumbError } = await supabase.storage
          .from('thumbnails')
          .upload(thumbName, thumbBlob, { contentType: 'image/jpeg' })

        if (!thumbError) {
          const {
            data: { publicUrl: tUrl },
          } = supabase.storage.from('thumbnails').getPublicUrl(thumbName)
          thumbnailUrl = tUrl
        }
      }

      setProgress(80)

      const { data: inserted, error: dbError } = await supabase
        .from('videos')
        .insert({
          user_id: user.id,
          caption: caption.trim() || null,
          video_url: publicUrl,
          thumbnail_url: thumbnailUrl,
          is_draft: asDraft,
          comments_enabled: commentsEnabled,
          visibility: visibility,
          sound_name:
  soundName.trim() ||
  `Original sound - @${(await supabase.from('profiles').select('username').eq('id', user.id).single()).data?.username || 'user'}`,
        })
        .select('id')
        .single()

      if (dbError) throw dbError

      if (!asDraft && caption.trim() && inserted?.id) {
        await notifyMentions(supabase, {
          text: caption.trim(),
          actorId: user.id,
          videoId: inserted.id,
        })
      }

      setProgress(100)
      setMessage(asDraft ? 'Draft tersimpan!' : 'Upload berhasil!')
      setTimeout(() => router.push(asDraft ? '/profile' : '/'), 1000)
    } catch (err: any) {
      setMessage(err.message || 'Gagal upload')
      setProgress(0)
    } finally {
      setUploading(false)
    }
  }

  const resetAll = () => {
    stopCamera()
        setVideoFilter('none')
    setFile(null)
    setPreview(null)
    setCoverPreview(null)
    setCaption('')
    setMessage('')
    setProgress(0)
    setDuration(0)
    setCoverTime(0)
    setEditingDraftId(null)
    setExistingVideoUrl(null)
    setExistingThumbUrl(null)
    setCommentsEnabled(true)
    setVisibility('public')
    setSoundName('')
    setMode('choose')
    router.replace('/upload')
  }
  const searchSounds = async (q: string) => {
    const query = q.trim()
    if (query.length < 1) {
      setSoundResults([])
      return
    }
    setSoundLoading(true)
    const { data } = await supabase
      .from('videos')
      .select('sound_name')
      .eq('is_draft', false)
      .not('sound_name', 'is', null)
      .ilike('sound_name', `%${query}%`)
      .limit(30)

    const unique = [
      ...new Set(
        (data || [])
          .map((r) => r.sound_name)
          .filter((s): s is string => !!s && s.trim().length > 0)
      ),
    ].slice(0, 8)

    setSoundResults(unique)
    setSoundLoading(false)
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
    const newCaption = caption.replace(/@([a-zA-Z0-9._]*)$/, `@${username} `)
    setCaption(newCaption)
    setShowMentions(false)
    setMentionQuery('')
    setMentionResults([])
  }

  const activeFilterCss =
    VIDEO_FILTERS.find((f) => f.id === videoFilter)?.css || 'none'

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  if (mode === 'choose') {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        <div className="px-4 h-14 flex items-center border-b border-white/10">
          <button onClick={() => router.back()} className="text-lg font-bold">←</button>
          <h1 className="flex-1 text-center font-semibold text-sm">Buat</h1>
          <div className="w-6" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
          <button
            onClick={() => startCamera()}
            className="w-full max-w-xs aspect-[9/16] max-h-[40vh] rounded-2xl bg-zinc-900 border border-white/10 flex flex-col items-center justify-center gap-3 active:scale-[0.98] transition"
          >
            <img src="/kamera.png" alt="" className="w-20 h-20 object-contain" />
            <p className="font-semibold"></p>
            <p className="text-xs text-gray-500">Kamera HP</p>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full max-w-xs py-4 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center gap-3 active:scale-[0.98] transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="font-medium">Upload dari Galeri</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {cameraError && (
            <p className="text-sm text-red-400 text-center px-4">{cameraError}</p>
          )}
        </div>
      </div>
    )
  }

  if (mode === 'camera') {
    return (
      <div className="fixed inset-0 bg-black text-white z-50 flex flex-col">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          playsInline
          autoPlay
        />

        <div className="relative z-10 flex items-center justify-between px-4 pt-4">
          <button
            onClick={() => {
              stopCamera()
              setMode('choose')
            }}
            className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center"
          >
            ✕
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => setMaxDuration(15)}
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                maxDuration === 15 ? 'bg-white text-black' : 'bg-black/40 text-white'
              }`}
            >
              15s
            </button>
            <button
              onClick={() => setMaxDuration(60)}
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                maxDuration === 60 ? 'bg-white text-black' : 'bg-black/40 text-white'
              }`}
            >
              60s
            </button>
          </div>

          <button
            onClick={flipCamera}
            disabled={recording}
            className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center disabled:opacity-40"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {recording && (
          <div className="relative z-10 flex justify-center mt-4">
            <div className="bg-red-500/90 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              {elapsed}s / {maxDuration}s
            </div>
          </div>
        )}

        <div className="relative z-10 mt-auto pb-10 flex flex-col items-center gap-4">
          <button
            onClick={recording ? stopRecording : startRecording}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center"
          >
            <div
              className={`transition-all ${
                recording
                  ? 'w-8 h-8 rounded-md bg-red-500'
                  : 'w-16 h-16 rounded-full bg-red-500'
              }`}
            />
          </button>
          <p className="text-xs text-white/70">
            {recording ? 'Ketuk untuk stop' : 'Ketuk untuk rekam'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="sticky top-0 z-50 bg-black/95 backdrop-blur-md border-b border-white/10 px-4 h-14 flex items-center justify-between">
        <button onClick={resetAll} className="text-white text-lg font-bold">
          ←
        </button>
        <h1 className="font-semibold text-sm">
          {editingDraftId ? 'Edit Video' : 'Preview'}
        </h1>
        <div className="w-6" />
      </div>

      <div className="px-4 pt-5 space-y-5">
        <div className="relative w-full aspect-[9/16] max-h-[42vh] mx-auto bg-zinc-900 rounded-2xl overflow-hidden border border-white/10">
          {preview && (
            <video
              ref={previewVideoRef}
              src={preview}
              className="w-full h-full object-cover"
              style={{ filter: activeFilterCss }}
              muted
              playsInline
              controls={!!editingDraftId}
              onLoadedMetadata={onPreviewLoaded}
            />
          )}
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-2">Filter</p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {VIDEO_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setVideoFilter(f.id)
                  // refresh cover dengan filter baru
                  if (previewVideoRef.current && duration > 0) {
                    void captureFrameAt(coverTime || 1)
                  }
                }}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  videoFilter === f.id
                    ? 'bg-vezao-gradient border-transparent text-white'
                    : 'bg-zinc-900 border-white/10 text-gray-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 mt-1.5">
            Filter di preview & cover. File video tetap original.
          </p>
        </div>

        {duration > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">Pilih Cover</p>
              <p className="text-xs text-gray-500">{coverTime.toFixed(1)}s</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-14 h-20 rounded-lg overflow-hidden border border-white/20 shrink-0 bg-zinc-800 flex items-center justify-center">
                {coverPreview ? (
                  <img
                    src={coverPreview}
                    alt="Cover"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] text-gray-500 text-center px-1">
                    Auto...
                  </span>
                )}
              </div>
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.1}
                value={coverTime}
                onChange={(e) => onCoverChange(Number(e.target.value))}
                className="flex-1 accent-purple-500"
              />
            </div>
          </div>
        )}

        <div className="relative">
          <label className="block text-xs text-gray-400 mb-2">Caption</label>
          <textarea
            value={caption}
            onChange={(e) => {
              const val = e.target.value
              setCaption(val)
              const upToCursor = val.slice(0, e.target.selectionStart || val.length)
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
            rows={3}
            maxLength={150}
            placeholder="Tulis caption... @teman #hashtag"
            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
          />
          <p className="text-[11px] text-gray-500 text-right mt-1">{caption.length}/150</p>

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
                      <p className="text-xs text-gray-400 truncate">@{u.username}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="relative">
          <label className="block text-xs text-gray-400 mb-2">Musik / suara (opsional)</label>
          <input
            value={soundName}
            onChange={(e) => {
              const val = e.target.value.slice(0, 80)
              setSoundName(val)
              setSoundQuery(val)
              if (val.trim().length >= 1) {
                setShowSoundSuggest(true)
                void searchSounds(val)
              } else {
                setShowSoundSuggest(false)
                setSoundResults([])
              }
            }}
            onFocus={() => {
              if (soundName.trim().length >= 1) {
                setShowSoundSuggest(true)
                void searchSounds(soundName)
              }
            }}
            onBlur={() => {
              // delay biar klik suggestion sempat
              setTimeout(() => setShowSoundSuggest(false), 200)
            }}
            placeholder="Cari atau ketik nama sound..."
            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />

          {showSoundSuggest && (
            <div className="absolute left-0 right-0 mt-1 z-30 rounded-xl border border-white/10 bg-zinc-900 overflow-hidden max-h-48 overflow-y-auto shadow-xl">
              {soundLoading ? (
                <p className="text-xs text-gray-500 px-3 py-2">Mencari...</p>
              ) : soundResults.length === 0 ? (
                <p className="text-xs text-gray-500 px-3 py-2">
                  Belum ada sound cocok — pakai nama yang kamu ketik
                </p>
              ) : (
                soundResults.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSoundName(s)
                      setShowSoundSuggest(false)
                    }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-white/5 flex items-center gap-2"
                  >
                    <span className="text-purple-400">♪</span>
                    <span className="truncate">{s}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Izinkan komentar */}
        <div className="flex items-center justify-between py-3 border-t border-white/10">
          <div>
            <p className="text-sm font-medium">Izinkan komentar</p>
            <p className="text-xs text-gray-400">Orang lain bisa komen di video ini</p>
          </div>
          <button
            type="button"
            onClick={() => setCommentsEnabled(!commentsEnabled)}
            className={`w-12 h-7 rounded-full transition relative shrink-0 ${
              commentsEnabled ? 'bg-vezao-gradient' : 'bg-zinc-600'
            }`}
          >
            <span
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ${
                commentsEnabled ? 'left-5' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        {/* Privasi post */}
        <div className="space-y-2 py-3 border-t border-white/10">
          <p className="text-sm font-medium">Siapa yang bisa lihat</p>
          <div className="flex flex-col gap-2">
            {[
              { value: 'public', label: 'Semua orang' },
              { value: 'followers', label: 'Followers saja' },
              { value: 'private', label: 'Hanya saya' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setVisibility(opt.value as any)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left ${
                  visibility === opt.value
                    ? 'bg-vezao-gradient/20 border border-purple-500/50'
                    : 'bg-zinc-900 border border-white/10'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    visibility === opt.value ? 'border-purple-400' : 'border-gray-500'
                  }`}
                >
                  {visibility === opt.value && (
                    <div className="w-2 h-2 rounded-full bg-purple-400" />
                  )}
                </div>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {uploading && (
          <div className="space-y-2">
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-vezao-gradient transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-center text-gray-400">Mengupload... {progress}%</p>
          </div>
        )}

        {message && (
          <div
            className={`text-sm p-3 rounded-xl text-center ${
              message.includes('berhasil') || message.includes('tersimpan')
                ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                : 'bg-red-500/15 text-red-400 border border-red-500/20'
            }`}
          >
            {message}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handleUpload(true)}
            disabled={uploading || (!file && !editingDraftId)}
            className="flex-1 bg-zinc-800 border border-white/10 py-3.5 rounded-full font-semibold text-sm disabled:opacity-40"
          >
            {uploading ? '...' : 'Simpan Draft'}
          </button>
          <button
            type="button"
            onClick={() => handleUpload(false)}
            disabled={uploading || (!file && !editingDraftId)}
            className="flex-1 bg-vezao-gradient py-3.5 rounded-full font-semibold text-sm disabled:opacity-40"
          >
            {uploading ? 'Mengupload...' : 'Posting'}
          </button>
        </div>

         <button type="button" onClick={resetAll} className="w-full text-sm text-gray-400 py-2">
          {editingDraftId ? 'Batal' : 'Buat ulang'}
        </button>
      </div>
    </div>
  )
}

export default function UploadPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <UploadContent />
    </Suspense>
  )
}