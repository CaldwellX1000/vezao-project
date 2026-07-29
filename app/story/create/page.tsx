'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function StoryCreatePage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image')
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

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

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setMessage('')

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const ext = file.name.split('.').pop() || (mediaType === 'video' ? 'mp4' : 'jpg')
      const path = `${user.id}/${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('stories')
        .upload(path, file, { upsert: false })

      if (upErr) throw upErr

      const {
        data: { publicUrl },
      } = supabase.storage.from('stories').getPublicUrl(path)

      const { error: dbErr } = await supabase.from('stories').insert({
        user_id: user.id,
        media_url: publicUrl,
        media_type: mediaType,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })

      if (dbErr) throw dbErr

      setMessage('Story berhasil diposting!')
      setTimeout(() => router.push('/'), 800)
    } catch (err: any) {
      setMessage(err.message || 'Gagal upload')
    } finally {
      setUploading(false)
    }
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
          className="text-sm font-semibold text-purple-400 disabled:opacity-40"
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
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full max-w-sm aspect-[9/16] rounded-2xl border border-dashed border-white/20 flex flex-col items-center justify-center gap-2 text-gray-400"
          >
            <span className="text-3xl">＋</span>
            <span className="text-sm">Pilih foto atau video</span>
            <span className="text-xs text-gray-600">Maks 40MB · hilang 24 jam</span>
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={onPick}
        />

        {preview && (
          <button
            onClick={() => {
              setFile(null)
              setPreview(null)
            }}
            className="text-sm text-gray-400"
          >
            Ganti file
          </button>
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