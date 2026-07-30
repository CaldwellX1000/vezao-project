'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import {
  getAccounts,
  persistCurrentSession,
  removeAccount,
  type StoredAccount,
} from '@/lib/accounts'

type Video = {
  id: string
  caption: string | null
  video_url: string
  is_pinned?: boolean | null
  views_count?: number | null
  thumbnail_url: string | null
  likes_count: number
  created_at: string
  is_draft?: boolean
  visibility?: string | null
  user_id?: string
}

export default function ProfilePage() {
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [bio, setBio] = useState('')
  const [website, setWebsite] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [videos, setVideos] = useState<Video[]>([])
  const [drafts, setDrafts] = useState<Video[]>([])
  const [likedVideos, setLikedVideos] = useState<Video[]>([])
  const [savedVideos, setSavedVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'videos' | 'private' | 'liked' | 'saved' | 'drafts'>('videos')
  const [privateVideos, setPrivateVideos] = useState<Video[]>([])
  const [followingCount, setFollowingCount] = useState(0)
  const [followersCount, setFollowersCount] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [inboxUnread, setInboxUnread] = useState(0)
  const [isPrivate, setIsPrivate] = useState(false)
  const [editIsPrivate, setEditIsPrivate] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [hasStory, setHasStory] = useState(false)
  const [showAccountSheet, setShowAccountSheet] = useState(false)
  const [accounts, setAccounts] = useState<StoredAccount[]>([])

  const [editFullName, setEditFullName] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editWebsite, setEditWebsite] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const loadVideos = async (uid: string) => {
    const { data: published } = await supabase
      .from('videos')
      .select(
        'id, caption, video_url, thumbnail_url, likes_count, is_pinned, views_count, created_at, is_draft, visibility'
      )
      .eq('user_id', uid)
      .eq('is_draft', false)
      .order('created_at', { ascending: false })

const list = published || []

    const isPriv = (v: any) => {
      const vis = String(v.visibility ?? 'public')
        .toLowerCase()
        .replace(/['"]/g, '')
        .trim()
      return vis === 'private'
    }

    const priv = list.filter(isPriv)
    const pub = list.filter((v: any) => !isPriv(v))

    const sortPin = (arr: Video[]) =>
      [...arr].sort((a: any, b: any) => {
        if (a.is_pinned && !b.is_pinned) return -1
        if (!a.is_pinned && b.is_pinned) return 1
        return 0
      })

    setVideos(sortPin(pub))
    setPrivateVideos(sortPin(priv))

    const { data: draftData } = await supabase
      .from('videos')
      .select(
        'id, caption, video_url, thumbnail_url, likes_count, views_count, created_at, is_draft'
      )
      .eq('user_id', uid)
      .eq('is_draft', true)
      .order('created_at', { ascending: false })

    setDrafts(draftData || [])
  }

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { count: storyCount } = await supabase
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gt('expires_at', new Date().toISOString())

      setHasStory((storyCount || 0) > 0)

      setUserId(user.id)

      const { count: msgCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('is_read', false)

      setInboxUnread(msgCount || 0)

      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)

      setUnreadCount(count || 0)

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, full_name, bio, avatar_url, cover_url, website, is_private')
        .eq('id', user.id)
        .single()

      const uname = profile?.username || 'user'
      const name = profile?.full_name || uname
      const userBio = profile?.bio || ''
      const userWebsite = profile?.website || ''
      const avatar = profile?.avatar_url || null
      const cover = profile?.cover_url || null
      const privateAcc = profile?.is_private || false

      setUsername(uname)
      setFullName(name)
      setBio(userBio)
      setWebsite(userWebsite)
      setAvatarUrl(avatar)
      setCoverUrl(cover)
      setIsPrivate(privateAcc)
      setEditUsername(uname)
      setEditFullName(name)
      setEditBio(userBio)
      setEditWebsite(userWebsite)
      setEditIsPrivate(privateAcc)

      // URL di browser jadi /@username
      if (uname && uname !== 'user') {
        window.history.replaceState(null, '', `/@${uname}`)
      }

      await loadVideos(user.id)

      const { data: likes } = await supabase
        .from('likes')
        .select('video_id')
        .eq('user_id', user.id)

      if (likes && likes.length > 0) {
        const videoIds = likes.map((l) => l.video_id)
        const { data: liked } = await supabase
          .from('videos')
          .select('id, caption, video_url, thumbnail_url, likes_count, views_count, created_at, user_id')
          .in('id', videoIds)
          .eq('is_draft', false)
          .order('created_at', { ascending: false })

        if (liked) setLikedVideos(liked)
      }

      const { data: savesJoined, error: savesError } = await supabase
        .from('saves')
        .select(
          `
          video_id,
          videos (
            id,
            caption,
            video_url,
            thumbnail_url,
            likes_count,
            views_count,
            created_at,
            user_id,
            is_draft
          )
        `
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (savesError) {
        console.error('saves error', savesError)
      }

      const savedList =
        (savesJoined || [])
          .map((row: any) => row.videos)
          .filter((v: any) => v && v.is_draft !== true) || []

      setSavedVideos(savedList)

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

      await persistCurrentSession(supabase)
      setAccounts(getAccounts())

      setLoading(false)
    }

    load()

    const interval = setInterval(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)

      setUnreadCount(count || 0)

      const { count: msgCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('is_read', false)

      setInboxUnread(msgCount || 0)
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  const handleLogout = async () => {
    setShowMenu(false)
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const switchAccount = async (account: StoredAccount) => {
    if (account.id === userId) {
      setShowAccountSheet(false)
      return
    }
    const { error } = await supabase.auth.setSession({
      access_token: account.access_token,
      refresh_token: account.refresh_token,
    })
    if (error) {
      alert('Gagal ganti akun. Silakan login ulang akun ini.')
      removeAccount(account.id)
      setAccounts(getAccounts())
      return
    }
    await persistCurrentSession(supabase)
    setShowAccountSheet(false)
    window.location.href = '/profile'
  }

  const handleAddAccount = async () => {
    setShowAccountSheet(false)
    router.push('/login?add=1')
  }

  const deleteDraft = async (videoId: string) => {
    if (!confirm('Hapus draft ini?')) return

    const { error } = await supabase.from('videos').delete().eq('id', videoId)
    if (!error) {
      setDrafts((prev) => prev.filter((d) => d.id !== videoId))
    } else {
      alert('Gagal hapus: ' + error.message)
    }
  }

  const togglePin = async (videoId: string, currentlyPinned: boolean) => {
    if (!userId) return

    if (!currentlyPinned) {
      const pinnedCount = videos.filter((v) => v.is_pinned).length
      if (pinnedCount >= 3) {
        alert('Maksimal 3 video yang bisa di-pin')
        return
      }
    }

    const { error } = await supabase
      .from('videos')
      .update({ is_pinned: !currentlyPinned })
      .eq('id', videoId)
      .eq('user_id', userId)

    if (error) {
      alert('Gagal: ' + error.message)
      return
    }

    setVideos((prev) => {
      const next = prev.map((v) =>
        v.id === videoId ? { ...v, is_pinned: !currentlyPinned } : v
      )
      return next.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1
        if (!a.is_pinned && b.is_pinned) return 1
        return 0
      })
    })
  }

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

    const {
      data: { publicUrl },
    } = supabase.storage.from('avatars').getPublicUrl(fileName)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId)

    if (!updateError) setAvatarUrl(publicUrl)
    setUploading(false)
  }

  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !userId) return

    if (!file.type.startsWith('image/')) {
      alert('File harus berupa gambar')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Ukuran gambar maksimal 5MB')
      return
    }

    setUploadingCover(true)
    const fileExt = file.name.split('.').pop()
    const fileName = `${userId}-cover-${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true })

    if (uploadError) {
      alert('Gagal upload cover: ' + uploadError.message)
      setUploadingCover(false)
      return
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('avatars').getPublicUrl(fileName)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ cover_url: publicUrl })
      .eq('id', userId)

    if (!updateError) setCoverUrl(publicUrl)
    else alert('Gagal simpan cover: ' + updateError.message)

    setUploadingCover(false)
    if (coverInputRef.current) coverInputRef.current.value = ''
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
        is_private: editIsPrivate,
      })
      .eq('id', userId)

    if (!error) {
      setUsername(editUsername.trim())
      setFullName(editFullName.trim())
      setBio(editBio.trim())
      setWebsite(editWebsite.trim())
      setIsPrivate(editIsPrivate)
      setEditing(false)
    } else {
      alert('Gagal menyimpan: ' + error.message)
    }
    setSaving(false)
  }

  const handleShareProfile = async () => {
    setShowMenu(false)
    const url = `${window.location.origin}/@${username}`

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

  const displayVideos =
    activeTab === 'videos'
      ? videos
      : activeTab === 'private'
      ? privateVideos
      : activeTab === 'liked'
      ? likedVideos
      : activeTab === 'saved'
      ? savedVideos
      : drafts

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white pb-20">
        <div className="h-28 bg-zinc-800 animate-pulse" />
        <div className="px-4 -mt-12">
          <div className="flex justify-between items-end">
            <div className="w-24 h-24 rounded-full bg-zinc-700 border-[3px] border-black animate-pulse" />
            <div className="h-8 w-20 bg-zinc-700 rounded-full animate-pulse mb-1" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white pb-20 md:bg-zinc-950">
      <div className="w-full md:max-w-[480px] md:mx-auto md:min-h-screen md:bg-black md:border-x md:border-white/10">
      <div className="relative h-28 overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt="Cover"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-vezao-gradient" />
        )}
        <button
          type="button"
          onClick={() => coverInputRef.current?.click()}
          disabled={uploadingCover}
          className="absolute bottom-2 right-3 z-10 px-3 py-1 rounded-full bg-black/50 backdrop-blur-sm text-[11px] font-medium border border-white/20"
        >
          {uploadingCover ? '...' : coverUrl ? 'Ganti sampul' : 'Tambah sampul'}
        </button>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUploadCover}
        />
      </div>

      <div className="px-4 -mt-12">
        <div className="flex justify-between items-end">
          <div className="relative">
            <div
              className={`w-24 h-24 rounded-full p-[3px] ${
                hasStory ? 'bg-vezao-gradient cursor-pointer' : 'bg-transparent'
              }`}
              onClick={() => {
                if (hasStory && userId) {
                  router.push(`/story/view?userId=${userId}`)
                }
              }}
            >
              <div className="w-full h-full rounded-full bg-zinc-800 border-[3px] border-black overflow-hidden flex items-center justify-center text-3xl font-bold">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  fullName?.[0]?.toUpperCase() || 'U'
                )}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                fileInputRef.current?.click()
              }}
              disabled={uploading}
              className="absolute bottom-0 right-0 w-7 h-7 bg-vezao-gradient rounded-full flex items-center justify-center border-2 border-black text-sm font-bold z-10"
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

          <div className="flex gap-2 mb-1 items-center">
            <button
              onClick={() => setEditing(true)}
              className="px-4 py-1.5 bg-zinc-800 border border-white/10 text-white text-sm font-semibold rounded-full"
            >
              Edit
            </button>
            <button
              onClick={handleShareProfile}
              className="px-4 py-1.5 bg-zinc-800 border border-white/10 text-white text-sm font-semibold rounded-full"
            >
              Share
            </button>

            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="w-9 h-9 bg-zinc-800 text-white rounded-full border border-white/10 flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                  />
                </svg>
              </button>

              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-11 z-50 w-44 bg-zinc-900 border border-white/10 rounded-xl overflow-hidden shadow-xl">
                    <button
                      onClick={handleShareProfile}
                      className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/5"
                    >
                      Share profil
                    </button>
                    <button
                      onClick={() => {
                        setShowMenu(false)
                        router.push('/settings')
                      }}
                      className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/5"
                    >
                      Settings
                    </button>
                    <button
                      onClick={() => {
                        setShowMenu(false)
                        router.push('/blocked')
                      }}
                      className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/5"
                    >
                      Daftar diblokir
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-white/5"
                    >
                      Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowAccountSheet(true)}
            className="flex items-center gap-1 max-w-full"
          >
            <h1 className="text-xl font-bold truncate">
              {fullName || username}
            </h1>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-white shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            {isPrivate && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-gray-300 border border-white/10 ml-1">
                Private
              </span>
            )}
          </button>
          <p className="text-sm text-gray-400">@{username}</p>
        </div>

        <div className="flex justify-around mt-4 py-3 rounded-2xl bg-zinc-900/80 border border-white/5">
          <div className="text-center flex-1">
            <p className="font-bold text-lg">{videos.length}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Videos</p>
          </div>
          <div
            className="text-center flex-1 cursor-pointer active:opacity-70"
            onClick={() => router.push(`/follow-list?userId=${userId}&type=following`)}
          >
            <p className="font-bold text-lg">{followingCount}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Following</p>
          </div>
          <div
            className="text-center flex-1 cursor-pointer active:opacity-70"
            onClick={() => router.push(`/follow-list?userId=${userId}&type=followers`)}
          >
            <p className="font-bold text-lg">{followersCount}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Followers</p>
          </div>
          <div className="text-center flex-1">
            <p className="font-bold text-lg">{totalLikes}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Likes</p>
          </div>
        </div>

        {bio && <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">{bio}</p>}

        {website && (
          <a
            href={website.startsWith('http') ? website : `https://${website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm text-blue-400 hover:underline"
          >
            {website.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>

      <div className="flex border-b border-white/10 mt-5">
        <button
          onClick={() => setActiveTab('videos')}
          className={`flex-1 py-3 flex justify-center ${
            activeTab === 'videos' ? 'border-b-2 border-white' : ''
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-5 h-5 ${activeTab === 'videos' ? 'text-white' : 'text-gray-500'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
            />
          </svg>
        </button>

        <button
          onClick={() => setActiveTab('private')}
          className={`flex-1 py-3 flex justify-center ${
            activeTab === 'private' ? 'border-b-2 border-white' : ''
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-5 h-5 ${activeTab === 'private' ? 'text-white' : 'text-gray-500'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </button>

        <button
          onClick={() => setActiveTab('liked')}
          className={`flex-1 py-3 flex justify-center ${
            activeTab === 'liked' ? 'border-b-2 border-white' : ''
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-5 h-5 ${activeTab === 'liked' ? 'text-white' : 'text-gray-500'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
        </button>

        <button
          onClick={() => setActiveTab('saved')}
          className={`flex-1 py-3 flex justify-center ${
            activeTab === 'saved' ? 'border-b-2 border-white' : ''
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-5 h-5 ${activeTab === 'saved' ? 'text-white' : 'text-gray-500'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
        </button>

        <button
          onClick={() => setActiveTab('drafts')}
          className={`flex-1 py-3 flex justify-center relative ${
            activeTab === 'drafts' ? 'border-b-2 border-white' : ''
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-5 h-5 ${activeTab === 'drafts' ? 'text-white' : 'text-gray-500'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          {drafts.length > 0 && (
            <span className="absolute top-2 right-[28%] min-w-[16px] h-4 px-1 rounded-full bg-vezao-gradient text-[10px] font-bold flex items-center justify-center">
              {drafts.length}
            </span>
          )}
        </button>
      </div>

      <div className="px-1 pt-1">
        {displayVideos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-2xl mb-4">
              {activeTab === 'videos'
                ? '🎬'
                : activeTab === 'private'
                ? '🔒'
                : activeTab === 'liked'
                ? '♡'
                : activeTab === 'saved'
                ? '🔖'
                : '📝'}
            </div>
            <p className="text-white font-semibold text-sm mb-1">
              {activeTab === 'videos'
                ? 'Belum ada video'
                : activeTab === 'private'
                ? 'Belum ada video privat'
                : activeTab === 'liked'
                ? 'Belum ada yang disukai'
                : activeTab === 'saved'
                ? 'Belum ada yang disimpan'
                : 'Belum ada draft'}
            </p>
            <p className="text-xs text-gray-500 mb-5 max-w-[240px]">
              {activeTab === 'videos'
                ? 'Upload video pertama kamu biar profil lebih hidup'
                : activeTab === 'private'
                ? 'Video dengan visibilitas Hanya saya muncul di sini'
                : activeTab === 'liked'
                ? 'Video yang kamu like akan terkumpul di sini'
                : activeTab === 'saved'
                ? 'Simpan video dari feed untuk ditonton nanti'
                : 'Draft tersimpan otomatis sebelum kamu posting'}
            </p>
            {activeTab === 'videos' && (
              <button
                onClick={() => router.push('/upload')}
                className="bg-vezao-gradient text-white px-6 py-2.5 rounded-full text-sm font-semibold"
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
                className="aspect-[9/16] bg-zinc-900 relative overflow-hidden"
              >
                {video.thumbnail_url ? (
                  <img
                    src={video.thumbnail_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    src={video.video_url}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                )}

                {activeTab === 'drafts' ? (
                  <div
                    onClick={() => router.push(`/upload?draft=${video.id}`)}
                    className="absolute inset-0 bg-black/40 flex flex-col items-end justify-between p-1.5 cursor-pointer"
                  >
                    <span className="text-[9px] bg-yellow-500 text-black px-1.5 py-0.5 rounded font-bold">
                      DRAFT
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteDraft(video.id)
                      }}
                      className="text-[10px] bg-black/70 text-red-400 px-2 py-1 rounded-full"
                    >
                      Hapus
                    </button>
                  </div>
                ) : (
                  <div className="absolute inset-0">
                    <div
                      onClick={() => {
                        if (!video.id) return
                        router.push(`/v/${video.id}`)
                      }}
                      className="absolute inset-0 cursor-pointer"
                    />
{activeTab === 'videos' && video.is_pinned === true && (
                      <span className="absolute top-1 left-1 text-xs z-10 drop-shadow pointer-events-none">
                        📌
                      </span>
                    )}
                    <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-1 px-1 z-10 pointer-events-none">
                      <span className="text-[10px] font-semibold text-white bg-black/50 rounded px-1 py-0.5">
                        ♥ {video.likes_count}
                      </span>
                      <span className="text-[10px] font-semibold text-white bg-black/50 rounded px-1 py-0.5">
                        ▶ {video.views_count || 0}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-end sm:items-center justify-center">
          <div className="w-full max-w-md bg-zinc-900 rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Edit Profile</h2>
              <button onClick={() => setEditing(false)} className="text-gray-400 text-xl">
                ✕
              </button>
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

              <div className="flex items-center justify-between py-3 border-t border-white/10">
                <div>
                  <p className="text-sm font-medium">Private Account</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Hanya followers yang bisa lihat video kamu
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditIsPrivate(!editIsPrivate)}
                  className={`w-12 h-7 rounded-full transition relative shrink-0 ${
                    editIsPrivate ? 'bg-vezao-gradient' : 'bg-zinc-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ${
                      editIsPrivate ? 'left-5' : 'left-0.5'
                    }`}
                  />
                </button>
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

      {showAccountSheet && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowAccountSheet(false)}
          />
          <div className="relative w-full max-w-[480px] bg-zinc-900 rounded-t-2xl pb-8 pt-3 px-4 max-h-[80vh] overflow-y-auto">
            <div className="w-10 h-1 bg-white/25 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="text-base font-semibold">Beralih akun</h3>
              <button
                onClick={() => setShowAccountSheet(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 text-lg"
              >
                ✕
              </button>
            </div>

            {accounts.map((acc) => {
              const active = acc.id === userId
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => switchAccount(acc)}
                  className="w-full flex items-center gap-3 py-3 px-1 active:bg-white/5 rounded-xl"
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-700 shrink-0 border border-white/10">
                    {acc.avatar_url ? (
                      <img
                        src={acc.avatar_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-lg font-bold bg-vezao-gradient">
                        {(acc.full_name || acc.username)?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {acc.full_name || acc.username}
                    </p>
                    <p className="text-xs text-gray-400 truncate">@{acc.username}</p>
                  </div>
                  {active && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-5 h-5 text-purple-400 shrink-0"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                  )}
                </button>
              )
            })}

            <button
              type="button"
              onClick={handleAddAccount}
              className="w-full flex items-center gap-3 py-3 px-1 mt-1 active:bg-white/5 rounded-xl"
            >
              <div className="w-12 h-12 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center shrink-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-6 h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="text-sm font-medium">Tambah akun</p>
            </button>
          </div>
        </div>
      )}

      <BottomNav />
      </div>
    </div>
  )
}