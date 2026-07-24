'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [checkingAuth, setCheckingAuth] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.replace('/login')
        return
      }
      setCheckingAuth(false)
    }
    checkUser()
  }, [])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setMessage('Pilih video dulu')
      return
    }

    setUploading(true)
    setMessage('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}/${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(fileName, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('videos')
        .getPublicUrl(fileName)

      const { error: dbError } = await supabase.from('videos').insert({
        user_id: user.id,
        caption: caption || null,
        video_url: publicUrl,
      })

      if (dbError) throw dbError

      setMessage('Upload berhasil!')
      setTimeout(() => {
        router.push('/')
      }, 1200)
    } catch (err: any) {
      setMessage(err.message || 'Gagal upload')
    } finally {
      setUploading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        Checking...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 rounded-2xl p-6">
        <h1 className="text-xl font-bold mb-6 text-center">Upload Video</h1>

        <form onSubmit={handleUpload} className="space-y-5">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Pilih Video</label>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              placeholder="Tulis caption..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {message && (
            <div className={`text-sm p-3 rounded-lg ${message.includes('berhasil') ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={uploading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 py-3 rounded-lg font-medium"
          >
            {uploading ? 'Mengupload...' : 'Upload'}
          </button>

          <button
            type="button"
            onClick={() => router.push('/')}
            className="w-full text-sm text-gray-400 hover:text-white"
          >
            Kembali ke Feed
          </button>
        </form>
      </div>
    </div>
  )
}