'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'

type Mode = 'choose' | 'gallery' | 'camera' | 'preview'

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

      if (draftId) {
        const { data: draft } = await supabase
          .from('videos')
          .select('id, caption, video_url, thumbnail_url, is_draft, user_id, comments_enabled, visibility')
          .eq('id', draftId)
          .eq('is_draft', true)
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
          width: { ideal: 1080 },
          height: { ideal: 1920 },
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
      const recordedFile = new File([blob], `vezao-${Date.now()}.webm`, { type: mimeType })
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

  const onPreviewLoaded = () => {
    const v = previewVideoRef.current
    if (!v) return
    setDuration(v.duration || 0)
    setCoverTime(0)
    if (!coverPreview) captureFrameAt(0)
  }

  const captureFrameAt = (time: number) => {
    const v = previewVideoRef.current
    if (!v) return

    const doCapture = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = v.videoWidth || 720
        canvas.height = v.videoHeight || 1280
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
        setCoverPreview(canvas.toDataURL('image/jpeg', 0.8))
      } catch {}
    }

    if (Math.abs(v.currentTime - time) < 0.05) {
      doCapture()
    } else {
      const onSeeked = () => {
        v.removeEventListener('seeked', onSeeked)
        doCapture()
      }
      v.addEventListener('seeked', onSeeked)
      v.currentTime = time
    }
  }

  const onCoverChange = (value: number) => {
    setCoverTime(value)
    captureFrameAt(value)
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

        if (coverPreview && coverPreview.startsWith('data:')) {
          const thumbBlob = await dataUrlToBlob(coverPreview)
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
          })
          .eq('id', editingDraftId)

        if (error) throw error

        setProgress(100)
        setMessage(asDraft ? 'Draft tersimpan!' : 'Upload berhasil!')
        setTimeout(() => router.push(asDraft ? '/profile' : '/'), 1000)
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
    setMessage('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const fileExt = file.name.split('.').pop() || 'webm'
      const fileName = `${user.id}/${Date.now()}.${fileExt}`

      setProgress(20)

      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(fileName, file)

      if (uploadError) throw uploadError

      setProgress(50)

      const { data: { publicUrl } } = supabase.storage
        .from('videos')
        .getPublicUrl(fileName)

      let thumbnailUrl: string | null = null
      if (coverPreview) {
        const thumbBlob = await dataUrlToBlob(coverPreview)
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

      setProgress(80)

      const { error: dbError } = await supabase.from('videos').insert({
        user_id: user.id,
        caption: caption.trim() || null,
        video_url: publicUrl,
        thumbnail_url: thumbnailUrl,
        is_draft: asDraft,
        comments_enabled: commentsEnabled,
        visibility: visibility,
      })

      if (dbError) throw dbError

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
    setMode('choose')
    router.replace('/upload')
  }

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
            <div className="w-16 h-16 rounded-full bg-vezao-gradient flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="font-semibold">Rekam</p>
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
          {editingDraftId ? 'Edit Draft' : 'Preview'}
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
              muted
              playsInline
              controls={!!editingDraftId}
              onLoadedMetadata={onPreviewLoaded}
            />
          )}
        </div>

        {duration > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">Pilih Cover</p>
              <p className="text-xs text-gray-500">{coverTime.toFixed(1)}s</p>
            </div>
            <div className="flex items-center gap-3">
              {coverPreview && (
                <img
                  src={coverPreview}
                  alt="Cover"
                  className="w-14 h-20 rounded-lg object-cover border border-white/20 shrink-0"
                />
              )}
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

        <div>
          <label className="block text-xs text-gray-400 mb-2">Caption</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            maxLength={150}
            placeholder="Tulis caption... pakai #hashtag"
            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
          />
          <p className="text-[11px] text-gray-500 text-right mt-1">{caption.length}/150</p>
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