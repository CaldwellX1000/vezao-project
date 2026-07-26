'use client'

import { useEffect, useState, useRef } from 'react'
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
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [bio, setBio] = useState('')
  const [website, setWebsite] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [likedVideos, setLikedVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'videos' | 'liked'>('videos')
  const [followingCount, setFollowingCount] = useState(0)
  const [followersCount, setFollowersCount] = useState(0)

  const [editFullName, setEditFullName] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editWebsite, setEditWebsite] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
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

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, full_name, bio, avatar_url, website')
        .eq('id', user.id)
        .single()

      const uname = profile?.username || 'user'
      const name = profile?.full_name || uname
      const userBio = profile?.bio || ''
      const userWebsite = profile?.website || ''
      const avatar = profile?.avatar_url || null

      setUsername(uname)
      setFullName(name)
      setBio(userBio)
      setWebsite(userWebsite)
      setAvatarUrl(avatar)
      setEditUsername(uname)
      setEditFullName(name)
      setEditBio(userBio)
      setEditWebsite(userWebsite)

      const { data: userVideos } = await supabase
        .from('videos')
        .select('id, caption, video_url, likes_count, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (userVideos) setVideos(userVideos)

      const { data: likes } = await supabase
        .from('likes')
        .select('video_id')
        .eq('user_id', user.id)

      if (likes && likes.length > 0) {
        const videoIds = likes.map((l) => l.video_id)
        const { data: liked } = await supabase
          .from('videos')
          .select('id, caption, video_url, likes_count, created_at')
          .in('id', videoIds)
          .order('created_at', { ascending: false })

        if (liked) setLikedVideos(liked)
      }

      const { count: following } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', user.id)

      const { count: followers } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', user.id)

      setFollowingCount(following || 0)
      setFollowersCount(followers || 0)

      setLoading(false)
    }

    load()
  }, [])

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !userId) return

    if (!file.type.startsWith('image/')) {
      alert('File harus berupa gambar')
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      alert('Ukuran gambar maksimal 3MB')
      return
    }

    setUploading(true)
    const fileExt = file.name.split('.').pop()
    const fileName = `${userId}-${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true })

    if (uploadError) {
      alert('Gagal upload: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId)

    if (!updateError) setAvatarUrl(publicUrl)
    setUploading(false)
  }

  const handleSave = async () => {
    if (!userId) return
    setSaving(true)

    const { error } = await supabase
      .from('profiles')
      .update({
        username: editUsername.trim(),
        full_name: editFullName.trim(),
        bio: editBio.trim(),
        website: editWebsite.trim() || null,
      })
      .eq('id', userId)

    if (!error) {
      setUsername(editUsername.trim())
      setFullName(editFullName.trim())
      setBio(editBio.trim())
      setWebsite(editWebsite.trim())
      setEditing(false)
    } else {
      alert('Gagal menyimpan: ' + error.message)
    }
    setSaving(false)
  }

  const handleShareProfile = async () => {
    const url = `${window.location.origin}/user-profile?userId=${userId}`

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${fullName || username} di VEZAO`,
          text: `Lihat profil ${fullName || username} di VEZAO`,
          url,
        })
      } catch {}
    } else {
      await navigator.clipboard.writeText(url)
      alert('Link profil berhasil disalin!')
    }
  }

  const totalLikes = videos.reduce((sum, v) => sum + (v.likes_count || 0), 0)
  const displayVideos = activeTab === 'videos' ? videos : likedVideos

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Cover */}
      <div className="h-28 bg-vezao-gradient" />

      <div className="px-4 -mt-12">
        <div className="flex justify-between items-end">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-zinc-800 border-[3px] border-black overflow-hidden flex items-center justify-center text-3xl font-bold">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                fullName?.[0]?.toUpperCase() || 'U'
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 w-7 h-7 bg-vezao-gradient rounded-full flex items-center justify-center border-2 border-black text-sm font-bold"
            >
              {uploading ? '…' : '+'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUploadAvatar}
            />
          </div>

          <div className="flex gap-2 mb-1">
            <button
              onClick={() => setEditing(true)}
              className="px-5 py-1.5 bg-white text-black text-sm font-semibold rounded-full"
            >
              Edit
            </button>
            <button
              onClick={handleShareProfile}
              className="w-9 h-9 bg-zinc-800 text-white rounded-full border border-white/10 flex items-center justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mt-3">
          <h1 className="text-xl font-bold">{fullName || username}</h1>
          <p className="text-sm text-gray-400">@{username}</p>
        </div>

        <div className="flex gap-6 mt-4">
          <div className="text-center">
            <p className="font-bold text-base">{videos.length}</p>
            <p className="text-xs text-gray-400">Videos</p>
          </div>
          <div className="text-center">
            <p className="font-bold text-base">{followingCount}</p>
            <p className="text-xs text-gray-400">Following</p>
          </div>
          <div className="text-center">
            <p className="font-bold text-base">{followersCount}</p>
            <p className="text-xs text-gray-400">Followers</p>
          </div>
          <div className="text-center">
            <p className="font-bold text-base">{totalLikes}</p>
            <p className="text-xs text-gray-400">Likes</p>
          </div>
        </div>

        {bio && (
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">{bio}</p>
        )}

        {/* Website / Link */}
        {website && (
          <a
            href={website.startsWith('http') ? website : `https://${website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm text-blue-400 hover:underline"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            {website.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 mt-5">
        <button
          onClick={() => setActiveTab('videos')}
          className={`flex-1 py-3 flex justify-center ${activeTab === 'videos' ? 'border-b-2 border-white' : ''}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 ${activeTab === 'videos' ? 'text-white' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </button>

        <button
          onClick={() => setActiveTab('liked')}
          className={`flex-1 py-3 flex justify-center ${activeTab === 'liked' ? 'border-b-2 border-white' : ''}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 ${activeTab === 'liked' ? 'text-white' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>
      </div>

      {/* Video Grid */}
      <div className="px-1 pt-1">
        {displayVideos.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 mb-3">
              {activeTab === 'videos' ? 'Belum ada video' : 'Belum ada video yang disukai'}
            </p>
            {activeTab === 'videos' && (
              <button
                onClick={() => router.push('/upload')}
                className="bg-vezao-gradient text-white px-6 py-2.5 rounded-full text-sm font-medium"
              >
                Upload Video
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-[2px]">
            {displayVideos.map((video) => (
              <div
                key={video.id}
                onClick={() => router.push(`/user-videos?userId=${userId}`)}
                className="aspect-[9/16] bg-zinc-900 relative overflow-hidden cursor-pointer active:opacity-80"
              >
                <video
                  src={video.video_url}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
                <div className="absolute bottom-1 left-1 flex items-center gap-1 text-xs font-medium">
                  <span>♥</span>
                  <span>{video.likes_count}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-end sm:items-center justify-center">
          <div className="w-full max-w-md bg-zinc-900 rounded-t-2xl sm:rounded-2xl p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Edit Profile</h2>
              <button onClick={() => setEditing(false)} className="text-gray-400 text-xl">✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Nama</label>
                <input
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500"
                  placeholder="Nama tampilan"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Username</label>
                <input
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500"
                  placeholder="username"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Bio</label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 resize-none"
                  placeholder="Tulis bio kamu..."
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Link / Website</label>
                <input
                  value={editWebsite}
                  onChange={(e) => setEditWebsite(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500"
                  placeholder="https://instagram.com/username"
                />
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full mt-6 bg-vezao-gradient py-3 rounded-full font-semibold text-sm disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/95 border-t border-white/10 h-16 flex items-center justify-around z-50 backdrop-blur-md">
        <button onClick={() => router.push('/')} className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
          </svg>
          <span className="text-[11px] text-gray-400">Home</span>
        </button>

        <button onClick={() => router.push('/upload')} className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-[11px] text-gray-400">Upload</span>
        </button>

        <button onClick={() => router.push('/profile')} className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-[11px] text-white">Profile</span>
        </button>
      </div>
    </div>
  )
}