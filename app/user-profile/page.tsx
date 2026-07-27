'use client'

import { Suspense, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'

type Video = {
  id: string
  caption: string | null
  video_url: string
  views_count?: number | null
  thumbnail_url: string | null
  likes_count: number
  created_at: string
  visibility?: string | null
  user_id?: string
}

function UserProfileContent() {
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
  const [isRequested, setIsRequested] = useState(false)
  const [isBlocked, setIsBlocked] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isPrivate, setIsPrivate] = useState(false)
  const [canViewVideos, setCanViewVideos] = useState(true)

  const router = useRouter()
  const supabase = createClient()

const loadVideos = async (
    userId: string,
    viewerId: string,
    isFollower: boolean
  ) => {
   const { data: userVideos, error } = await supabase
      .from('videos')
.select(
  'id, caption, video_url, thumbnail_url, likes_count, views_count, created_at, visibility, user_id, is_draft'
)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    console.log('loadVideos:', { count: userVideos?.length, error })

    if (error) {
      console.error('loadVideos error:', error)
      setVideos([])
      return
    }

    // sementara: tampilkan semua kecuali draft eksplisit true
    const filtered = (userVideos || []).filter((v: any) => v.is_draft !== true)
    console.log('loadVideos filtered:', filtered.length, 'isFollower:', isFollower)

    setVideos(filtered)
  }
  
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

      const { data: blockData } = await supabase
        .from('blocks')
        .select('id')
        .eq('blocker_id', user.id)
        .eq('blocked_id', targetUserId)
        .maybeSingle()

      setIsBlocked(!!blockData)

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, full_name, bio, avatar_url, website, is_private')
        .eq('id', targetUserId)
        .single()

      if (profile) {
        setUsername(profile.username || 'user')
        setFullName(profile.full_name || profile.username || 'user')
        setBio(profile.bio || '')
        setWebsite(profile.website || '')
        setAvatarUrl(profile.avatar_url || null)
        setIsPrivate(profile.is_private || false)
      }

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

      const isFollower = !!followData
      setIsFollowing(isFollower)

      if (!isFollower) {
        const { data: req } = await supabase
          .from('follow_requests')
          .select('id')
          .eq('requester_id', user.id)
          .eq('target_id', targetUserId)
          .eq('status', 'pending')
          .maybeSingle()
        setIsRequested(!!req)
      } else {
        setIsRequested(false)
      }

      const isOwn = user.id === targetUserId
      const privateAcc = profile?.is_private || false
      const allow = isOwn || !privateAcc || isFollower
      setCanViewVideos(allow)

      if (allow) {
        await loadVideos(targetUserId, user.id, isFollower)
      } else {
        setVideos([])
      }

      setLoading(false)
    }

    load()
  }, [targetUserId])

  const toggleFollow = async () => {
    if (!currentUserId || !targetUserId || currentUserId === targetUserId) return

    // Unfollow
    if (isFollowing) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', targetUserId)

      setIsFollowing(false)
      setFollowersCount((prev) => Math.max(0, prev - 1))

      if (isPrivate) {
        setCanViewVideos(false)
        setVideos([])
      } else {
        await loadVideos(targetUserId, currentUserId, false)
      }
      return
    }

    // Cancel request
    if (isRequested) {
      await supabase
        .from('follow_requests')
        .delete()
        .eq('requester_id', currentUserId)
        .eq('target_id', targetUserId)
        .eq('status', 'pending')
      setIsRequested(false)
      return
    }

    // Private → request
    if (isPrivate) {
      const { error } = await supabase.from('follow_requests').insert({
        requester_id: currentUserId,
        target_id: targetUserId,
        status: 'pending',
      })
      if (!error) {
        setIsRequested(true)
        await supabase.from('notifications').insert({
          user_id: targetUserId,
          actor_id: currentUserId,
          type: 'follow_request',
          video_id: null,
          message: null,
          is_read: false,
        })
      }
      return
    }

    // Public → follow langsung
    const { error } = await supabase.from('follows').insert({
      follower_id: currentUserId,
      following_id: targetUserId,
    })

    if (!error) {
      setIsFollowing(true)
      setFollowersCount((prev) => prev + 1)
      setCanViewVideos(true)
      await loadVideos(targetUserId, currentUserId, true)

      await supabase.from('notifications').insert({
        user_id: targetUserId,
        actor_id: currentUserId,
        type: 'follow',
        video_id: null,
        message: null,
        is_read: false,
      })
    }
  }

  const toggleBlock = async () => {
    if (!currentUserId || !targetUserId || currentUserId === targetUserId) return

    if (isBlocked) {
      await supabase
        .from('blocks')
        .delete()
        .eq('blocker_id', currentUserId)
        .eq('blocked_id', targetUserId)
      setIsBlocked(false)
    } else {
      const confirmBlock = confirm(`Block @${username}? Mereka tidak bisa melihat profil dan video kamu.`)
      if (!confirmBlock) return

      const { error } = await supabase.from('blocks').insert({
        blocker_id: currentUserId,
        blocked_id: targetUserId,
      })

      if (!error) {
        if (isFollowing) {
          await supabase
            .from('follows')
            .delete()
            .eq('follower_id', currentUserId)
            .eq('following_id', targetUserId)
          setIsFollowing(false)
          setFollowersCount((prev) => Math.max(0, prev - 1))
          if (isPrivate) {
            setCanViewVideos(false)
            setVideos([])
          }
        }
        await supabase
          .from('follow_requests')
          .delete()
          .eq('requester_id', currentUserId)
          .eq('target_id', targetUserId)
        setIsRequested(false)
        setIsBlocked(true)
      }
    }
  }

  const followLabel = isFollowing
    ? 'Following'
    : isRequested
    ? 'Requested'
    : 'Follow'

  const totalLikes = videos.reduce((sum, v) => sum + (v.likes_count || 0), 0)

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white pb-20">
        <div className="h-28 bg-zinc-800 animate-pulse" />
        <div className="px-4 -mt-12">
          <div className="flex justify-between items-end">
            <div className="w-24 h-24 rounded-full bg-zinc-700 border-[3px] border-black animate-pulse" />
            <div className="flex gap-2 mb-1">
              <div className="h-8 w-20 bg-zinc-700 rounded-full animate-pulse" />
              <div className="h-8 w-16 bg-zinc-700 rounded-full animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white pb-20">
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
            <div className="flex gap-2 mb-1 items-center">
              <button
                onClick={toggleFollow}
                disabled={isBlocked}
                className={`px-5 py-1.5 text-sm font-semibold rounded-full ${
                  isFollowing || isRequested
                    ? 'bg-white/20 text-white'
                    : 'bg-vezao-gradient text-white'
                } ${isBlocked ? 'opacity-50' : ''}`}
              >
                {followLabel}
              </button>

              <button
                onClick={() => router.push(`/inbox/chat?userId=${targetUserId}`)}
                disabled={isBlocked}
                className={`px-4 py-1.5 bg-zinc-800 text-white text-sm font-semibold rounded-full border border-white/10 ${isBlocked ? 'opacity-50' : ''}`}
              >
                Message
              </button>

              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="w-9 h-9 bg-zinc-800 text-white rounded-full border border-white/10 flex items-center justify-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="6" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                    <circle cx="12" cy="18" r="1.5" />
                  </svg>
                </button>

                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-11 z-50 w-44 bg-zinc-900 border border-white/10 rounded-xl overflow-hidden shadow-xl">
                      <button
                        onClick={() => {
                          setShowMenu(false)
                          toggleBlock()
                        }}
                        className="w-full px-4 py-3 text-left text-sm hover:bg-white/5 text-red-400"
                      >
                        {isBlocked ? 'Unblock' : 'Block'}
                      </button>
                      <button
                        onClick={async () => {
                          setShowMenu(false)
                          if (!currentUserId || !targetUserId) return
                          const reason = prompt('Alasan report (opsional):')
                          if (reason === null) return

                          const { error } = await supabase.from('reports').insert({
                            reporter_id: currentUserId,
                            reported_user_id: targetUserId,
                            video_id: null,
                            reason: reason || null,
                          })

                          if (error) alert('Gagal report: ' + error.message)
                          else alert('Terima kasih. Laporan sudah dikirim.')
                        }}
                        className="w-full px-4 py-3 text-left text-sm hover:bg-white/5 text-white border-t border-white/5"
                      >
                        Report
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{fullName || username}</h1>
            {isPrivate && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-gray-300 border border-white/10">
                🔒 Private
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">@{username}</p>
        </div>

        <div className="flex gap-6 mt-4">
          <div className="text-center">
            <p className="font-bold text-base">{canViewVideos ? videos.length : '—'}</p>
            <p className="text-xs text-gray-400">Videos</p>
          </div>
          <div
            className="text-center cursor-pointer"
            onClick={() => router.push(`/follow-list?userId=${targetUserId}&type=following`)}
          >
            <p className="font-bold text-base">{followingCount}</p>
            <p className="text-xs text-gray-400">Following</p>
          </div>
          <div
            className="text-center cursor-pointer"
            onClick={() => router.push(`/follow-list?userId=${targetUserId}&type=followers`)}
          >
            <p className="font-bold text-base">{followersCount}</p>
            <p className="text-xs text-gray-400">Followers</p>
          </div>
          <div className="text-center">
            <p className="font-bold text-base">{canViewVideos ? totalLikes : '—'}</p>
            <p className="text-xs text-gray-400">Likes</p>
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
        <button className="flex-1 py-3 flex justify-center border-b-2 border-white">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </button>
      </div>

      <div className="px-1 pt-1">
        {!canViewVideos ? (
          <div className="text-center py-16 px-6">
            <div className="text-4xl mb-3">🔒</div>
            <p className="font-semibold mb-1">This account is private</p>
            <p className="text-sm text-gray-400">
              {isRequested
                ? 'Request sudah dikirim. Tunggu persetujuan.'
                : `Follow @${username} untuk melihat video mereka`}
            </p>
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-20 text-gray-400">Belum ada video</div>
        ) : (
          <div className="grid grid-cols-3 gap-[2px]">
            {videos.map((video) => (
              <div
                key={video.id}
                onClick={() => router.push(`/user-videos?userId=${targetUserId}`)}
                className="aspect-[9/16] bg-zinc-900 relative overflow-hidden cursor-pointer active:opacity-80"
              >
                {video.thumbnail_url ? (
                  <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <video
                    src={video.video_url}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                )}
  <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between text-[10px] font-medium drop-shadow px-1">
                  <span>♥ {video.likes_count}</span>
                  <span>👁 {video.views_count || 0}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-black/95 border-t border-white/10 h-16 flex items-center justify-around z-50 backdrop-blur-md">
        <button onClick={() => router.push('/')} className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
          </svg>
          <span className="text-[11px] text-gray-400">Home</span>
        </button>

        <button onClick={() => router.push('/search')} className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="text-[11px] text-gray-400">Search</span>
        </button>

        <button onClick={() => router.push('/upload')} className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-[11px] text-gray-400">Upload</span>
        </button>

        <button onClick={() => router.push('/inbox')} className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span className="text-[11px] text-gray-400">Inbox</span>
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

export default function UserProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <UserProfileContent />
    </Suspense>
  )
}