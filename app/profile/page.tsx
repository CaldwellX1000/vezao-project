'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Video = {
  id: string
  caption: string | null
  video_url: string
  likes_count: number
  created_at: string
}

export default function ProfilePage() {
  const [email, setEmail] = useState<string | null>(null)
  const [username, setUsername] = useState<string>('')
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      setUserId(user.id)
      setEmail(user.email ?? null)

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, full_name')
        .eq('id', user.id)
        .single()

      const uname = profile?.username || profile?.full_name || 'user'
      setUsername(uname)
      setNewUsername(uname)

      const { data: userVideos } = await supabase
        .from('videos')
        .select('id, caption, video_url, likes_count, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (userVideos) setVideos(userVideos)
      setLoading(false)
    }

    load()
  }, [])

  const handleSaveUsername = async () => {
    if (!userId || !newUsername.trim()) return
    setSaving(true)

    const { error } = await supabase
      .from('profiles')
      .update({ username: newUsername.trim() })
      .eq('id', userId)

    if (!error) {
      setUsername(newUsername.trim())
      setEditing(false)
    } else {
      alert('Gagal menyimpan: ' + error.message)
    }
    setSaving(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Header */}
      <div className="pt-10 px-4 pb-6 border-b border-white/10">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-2xl font-bold">
            {username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1">
            {editing ? (
              <div className="flex gap-2">
                <input
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm w-full"
                  placeholder="Username"
                />
                <button
                  onClick={handleSaveUsername}
                  disabled={saving}
                  className="bg-indigo-600 px-3 py-1.5 rounded-lg text-sm"
                >
                  {saving ? '...' : 'Save'}
                </button>
              </div>
            ) : (
              <>
                <h1 className="text-lg font-bold">@{username}</h1>
                <p className="text-sm text-gray-400">{email}</p>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-6 mt-5 text-sm">
          <div>
            <span className="font-bold">{videos.length}</span>
            <span className="text-gray-400 ml-1">Video</span>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="flex-1 bg-white/10 hover:bg-white/20 py-2 rounded-lg text-sm"
            >
              Edit Profile
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex-1 bg-white/10 hover:bg-white/20 py-2 rounded-lg text-sm"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Video Grid */}
      <div className="px-2 pt-4">
        <h2 className="text-sm font-semibold text-gray-400 px-2 mb-3">Video Kamu</h2>

        {videos.length === 0 ? (
          <div className="text-center text-gray-500 py-16">
            <p>Belum ada video</p>
            <button
              onClick={() => router.push('/upload')}
              className="mt-3 text-indigo-400 text-sm"
            >
              Upload video pertama
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {videos.map((video) => (
              <div key={video.id} className="aspect-[9/16] bg-zinc-900 relative overflow-hidden">
                <video
                  src={video.video_url}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
                <div className="absolute bottom-1 left-1 text-xs bg-black/50 px-1 rounded">
                  ♥ {video.likes_count}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-black border-t border-white/10 h-16 flex items-center justify-around z-50">
        <button onClick={() => router.push('/')} className="flex flex-col items-center gap-1">
          <span className="text-xl text-gray-500">🏠</span>
          <span className="text-xs text-gray-500">Home</span>
        </button>
        <button onClick={() => router.push('/upload')} className="flex flex-col items-center gap-1">
          <span className="text-xl text-gray-500">➕</span>
          <span className="text-xs text-gray-500">Upload</span>
        </button>
        <button onClick={() => router.push('/profile')} className="flex flex-col items-center gap-1">
          <span className="text-xl text-white">👤</span>
          <span className="text-xs text-white">Profile</span>
        </button>
      </div>
    </div>
  )
}