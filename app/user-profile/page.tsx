'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'

type Video = {
  id: string
  caption: string | null
  video_url: string
  likes_count: number
  created_at: string
}

export default function UserProfilePage() {
  const searchParams = useSearchParams()
  const targetUserId = searchParams.get('userId')

  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [bio, setBio] = useState('')
  const [website, setWebsite] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [followingCount, setFollowingCount] = useState(0)
  const [followersCount, setFollowersCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      if (!targetUserId) {
        router.replace('/')
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setCurrentUserId(user.id)

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, full_name, bio, avatar_url, website')
        .eq('id', targetUserId)
        .single()

      if (profile) {
        setUsername(profile.username || 'user')
        setFullName(profile.full_name || profile.username || 'user')
        setBio(profile.bio || '')
        setWebsite(profile.website || '')
        setAvatarUrl(profile.avatar_url || null)
      }

      const { data: userVideos } = await supabase
        .from('videos')
        .select('id, caption, video_url, likes_count, created_at')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })

      if (userVideos) setVideos(userVideos)

      const { count: following } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', targetUserId)

      const { count: followers } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', targetUserId)

      setFollowingCount(following || 0)
      setFollowersCount(followers || 0)

      const { data: followData } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId)
        .maybeSingle()

      setIsFollowing(!!followData)
      setLoading(false)
    }

    load()
  }, [targetUserId])

  const toggleFollow = async () => {
    if (!currentUserId || !targetUserId || currentUserId === targetUserId) return

    if (isFollowing) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', targetUserId)

      setIsFollowing(false)
      setFollowersCount((prev) => Math.max(0, prev - 1))
    } else {
      const { error } = await supabase.from('follows').insert({
        follower_id: currentUserId,
        following_id: targetUserId,
      })

      if (!error) {
        setIsFollowing(true)
        setFollowersCount((prev) => prev + 1)
      }
    }
  }

  const totalLikes = videos.reduce((sum, v) => sum + (v.likes_count || 0), 0)

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
          <div className="w-24 h-24 rounded-full bg-zinc-800 border-[3px] border-black overflow-hidden flex items-center justify-center text-3xl font-bold">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              fullName?.[0]?.toUpperCase() || 'U'
            )}
          </div>

          {currentUserId !== targetUserId && (
            <div className="flex gap-2 mb-1">
              <button
                onClick={toggleFollow}
                className={`px-5 py-1.5 text-sm font-semibold rounded-full ${
                  isFollowing
                    ? 'bg-white/20 text-white'
                    : 'bg-vezao-gradient text-white'
                }`}
              >
                {isFollowing ? 'Following' : 'Follow'}
              </button>

              <button
                onClick={() => router.push(`/inbox/chat?userId=${targetUserId}`)}
                className="px-4 py-1.5 bg-zinc-800 text-white text-sm font-semibold rounded-full border border-white/10"
              >
                Message
              </button>
            </div>
          )}
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
        <button className="flex-1 py-3 flex justify-center border-b-2 border-white">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </button>
      </div>

      {/* Video Grid */}
      <div className="px-1 pt-1">
        {videos.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            Belum ada video
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-[2px]">
            {videos.map((video) => (
              <div
                key={video.id}
                onClick={() => router.push(`/user-videos?userId=${targetUserId}`)}
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
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-[11px] text-gray-400">Profile</span>
        </button>
      </div>
    </div>
  )
}