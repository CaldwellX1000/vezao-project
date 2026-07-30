'use client'

import { Suspense, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

type Video = {
  id: string
  caption: string | null
  video_url: string
  views_count?: number | null
  thumbnail_url: string | null
  likes_count: number
  is_pinned?: boolean | null
  created_at: string
  visibility?: string | null
  user_id?: string
}

function ProfileByUsername() {
  const params = useParams()
  const usernameParam = decodeURIComponent(String(params.username || ''))

  const [targetUserId, setTargetUserId] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [bio, setBio] = useState('')
  const [website, setWebsite] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [followsMe, setFollowsMe] = useState(false)
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
  const [hasStory, setHasStory] = useState(false)
  const [canViewVideos, setCanViewVideos] = useState(true)

  const router = useRouter()
  const supabase = createClient()

  const loadVideos = async (
    userId: string,
    viewerId: string,
    isFollower: boolean
  ) => {
    const { data: userVideos } = await supabase
      .from('videos')
      .select(
        'id, caption, video_url, thumbnail_url, likes_count, views_count, is_pinned, created_at, visibility, user_id, is_draft'
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    const filtered = (userVideos || []).filter((v: any) => {
      if (v.is_draft === true) return false
      if (viewerId === userId) return true
      const vis = String(v.visibility || 'public')
        .toLowerCase()
        .replace(/'/g, '')
        .trim()
      if (vis === 'private') return false
      if (vis === 'followers') return isFollower
      return true
    })

    const sorted = [...filtered].sort((a: any, b: any) => {
      if (a.is_pinned && !b.is_pinned) return -1
      if (!a.is_pinned && b.is_pinned) return 1
      return 0
    })
    setVideos(sorted)
  }

  useEffect(() => {
    const load = async () => {
      if (!usernameParam) {
        router.replace('/')
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setCurrentUserId(user.id)

      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          usernameParam
        )

      let byName = null

      if (isUuid) {
        const { data } = await supabase
          .from('profiles')
          .select('id, username, full_name, bio, avatar_url, cover_url, website, is_private')
          .eq('id', usernameParam)
          .maybeSingle()
        byName = data
      } else {
        const { data } = await supabase
          .from('profiles')
          .select('id, username, full_name, bio, avatar_url, cover_url, website, is_private')
          .ilike('username', usernameParam)
          .maybeSingle()
        byName = data
      }

      if (!byName) {
        alert('User tidak ditemukan: ' + usernameParam)
        router.replace('/')
        return
      }

      const resolvedId = byName.id

      // Profil sendiri → pakai halaman /profile (Edit, pin, tabs, dll)
      if (user.id === resolvedId) {
        router.replace('/profile')
        return
      }

      setTargetUserId(resolvedId)
      setUsername(byName.username || 'user')
      setFullName(byName.full_name || byName.username || 'user')
      setBio(byName.bio || '')
      setWebsite(byName.website || '')
      setAvatarUrl(byName.avatar_url || null)
      setCoverUrl((byName as any).cover_url || null)
      setIsPrivate(byName.is_private || false)

            const nowIso = new Date().toISOString()
      const { data: activeStories } = await supabase
        .from('stories')
        .select('id')
        .eq('user_id', resolvedId)
        .or(`expires_at.gt.${nowIso},expires_at.is.null`)
        .limit(1)

      setHasStory(!!(activeStories && activeStories.length > 0))

      const { data: blockData } = await supabase
        .from('blocks')
        .select('id')
        .eq('blocker_id', user.id)
        .eq('blocked_id', resolvedId)
        .maybeSingle()
      setIsBlocked(!!blockData)

      const { count: following } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', resolvedId)

      const { count: followers } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', resolvedId)

      setFollowingCount(following || 0)
      setFollowersCount(followers || 0)

      const { data: followData } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', resolvedId)
        .maybeSingle()

      const isFollower = !!followData
      setIsFollowing(isFollower)

      const { data: reverseFollow } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', resolvedId)
        .eq('following_id', user.id)
        .maybeSingle()
      setFollowsMe(!!reverseFollow)

      if (!isFollower) {
        const { data: req } = await supabase
          .from('follow_requests')
          .select('id')
          .eq('requester_id', user.id)
          .eq('target_id', resolvedId)
          .eq('status', 'pending')
          .maybeSingle()
        setIsRequested(!!req)
      }

      const isOwn = user.id === resolvedId
      const allow = isOwn || !byName.is_private || isFollower
      setCanViewVideos(allow)

      if (allow) await loadVideos(resolvedId, user.id, isFollower)
      else setVideos([])

      setLoading(false)
    }

    load()
  }, [usernameParam])

  const toggleFollow = async () => {
    if (!currentUserId || !targetUserId || currentUserId === targetUserId) return

    if (isFollowing) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', targetUserId)
      setIsFollowing(false)
      setFollowersCount((p) => Math.max(0, p - 1))
      if (isPrivate) {
        setCanViewVideos(false)
        setVideos([])
      }
      return
    }

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

    const { error } = await supabase.from('follows').insert({
      follower_id: currentUserId,
      following_id: targetUserId,
    })
    if (!error) {
      setIsFollowing(true)
      setFollowersCount((p) => p + 1)
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

  const followLabel = isFollowing
    ? 'Following'
    : isRequested
    ? 'Requested'
    : followsMe
    ? 'Follow back'
    : 'Follow'

  const totalLikes = videos.reduce((s, v) => s + (v.likes_count || 0), 0)

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white pb-20 md:bg-zinc-950">
      <div className="w-full md:max-w-[480px] md:mx-auto md:min-h-screen md:bg-black md:border-x md:border-white/10">
      <div className="relative h-28 overflow-hidden z-0">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt="Cover"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-vezao-gradient" />
        )}
      </div>
      <div className="relative z-10 px-4 -mt-12">
        <div className="flex justify-between items-end">
          <div
            className={`w-[104px] h-[104px] rounded-full flex items-center justify-center ${
              hasStory ? 'bg-vezao-gradient p-[3px] cursor-pointer' : 'p-0'
            }`}
            onClick={() => {
              if (hasStory && targetUserId) {
                router.push(`/story/view?userId=${targetUserId}`)
              }
            }}
          >
            <div className="w-24 h-24 rounded-full bg-black p-[2px]">
              <div className="w-full h-full rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center text-3xl font-bold">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  fullName?.[0]?.toUpperCase() || 'U'
                )}
              </div>
            </div>
          </div>

          {currentUserId !== targetUserId && (
            <div className="flex gap-2 mb-1 items-center">
              <button
                onClick={toggleFollow}
                disabled={isBlocked}
                className={`px-4 py-1.5 text-sm font-semibold rounded-full ${
                  isFollowing || isRequested
                    ? 'bg-zinc-800 border border-white/10'
                    : 'bg-vezao-gradient'
                } ${isBlocked ? 'opacity-50' : ''}`}
              >
                {followLabel}
              </button>
              <button
                onClick={() => {
                  if (isBlocked) {
                    alert('Tidak bisa chat. Akun ini diblokir.')
                    return
                  }
                  router.push(`/inbox/chat?userId=${targetUserId}`)
                }}
                className="px-4 py-1.5 bg-zinc-800 text-sm font-semibold rounded-full border border-white/10"
              >
                Message
              </button>

              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="w-9 h-9 bg-zinc-800 text-white rounded-full border border-white/10 flex items-center justify-center"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="6" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                    <circle cx="12" cy="18" r="1.5" />
                  </svg>
                </button>

                {showMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowMenu(false)}
                    />
                    <div className="absolute right-0 top-11 z-50 w-44 bg-zinc-900 border border-white/10 rounded-xl overflow-hidden shadow-xl">
                      <button
                        onClick={async () => {
                          setShowMenu(false)
                          const url = `${window.location.origin}/@${username}`
                          try {
                            if (navigator.share) {
                              await navigator.share({
                                title: `${fullName || username} di VEZAO`,
                                url,
                              })
                            } else {
                              await navigator.clipboard.writeText(url)
                              alert('Link profil disalin!')
                            }
                          } catch {}
                        }}
                        className="w-full px-4 py-3 text-left text-sm hover:bg-white/5 text-white"
                      >
                        Share profil
                      </button>
                      <button
                        onClick={async () => {
                          setShowMenu(false)
                          if (!currentUserId || !targetUserId) return

                          if (isBlocked) {
                            await supabase
                              .from('blocks')
                              .delete()
                              .eq('blocker_id', currentUserId)
                              .eq('blocked_id', targetUserId)
                            setIsBlocked(false)
                            return
                          }

                          const ok = confirm(
                            `Block @${username}? Mereka tidak bisa lihat profil dan video kamu.`
                          )
                          if (!ok) return

                          const { error } = await supabase.from('blocks').insert({
                            blocker_id: currentUserId,
                            blocked_id: targetUserId,
                          })
                          if (error) {
                            alert('Gagal block: ' + error.message)
                            return
                          }

                          if (isFollowing) {
                            await supabase
                              .from('follows')
                              .delete()
                              .eq('follower_id', currentUserId)
                              .eq('following_id', targetUserId)
                            setIsFollowing(false)
                            setFollowersCount((p) => Math.max(0, p - 1))
                          }
                          await supabase
                            .from('follow_requests')
                            .delete()
                            .eq('requester_id', currentUserId)
                            .eq('target_id', targetUserId)

                          setIsRequested(false)
                          setIsBlocked(true)
                        }}
                        className="w-full px-4 py-3 text-left text-sm hover:bg-white/5 text-red-400 border-t border-white/5"
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
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-white/10">
                Private
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">@{username}</p>
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
            {website.replace(/^https?:\/\//, '')}
          </a>
        )}

        <div className="flex justify-around mt-4 py-3.5 rounded-2xl bg-zinc-900 border border-white/15">
          <div className="text-center flex-1">
            <p className="font-bold text-lg">
              {canViewVideos ? videos.length : '—'}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">Videos</p>
          </div>
          <div
            className="text-center flex-1 cursor-pointer active:opacity-70"
            onClick={() =>
              router.push(`/follow-list?userId=${targetUserId}&type=following`)
            }
          >
            <p className="font-bold text-lg">{followingCount}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Following</p>
          </div>
          <div
            className="text-center flex-1 cursor-pointer active:opacity-70"
            onClick={() =>
              router.push(`/follow-list?userId=${targetUserId}&type=followers`)
            }
          >
            <p className="font-bold text-lg">{followersCount}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Followers</p>
          </div>
          <div className="text-center flex-1">
            <p className="font-bold text-lg">
              {canViewVideos ? totalLikes : '—'}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">Likes</p>
          </div>
        </div>
      </div>

      <div className="px-1 pt-4">
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
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-2xl mb-4">
              🎬
            </div>
            <p className="text-white font-semibold text-sm mb-1">Belum ada video</p>
            <p className="text-xs text-gray-500">
              @{username} belum mengunggah video
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-[2px]">
            {videos.map((video) => (
              <div
                key={video.id}
                onClick={() => {
                  if (!video.id) return
                  window.location.href = `/v/${video.id}`
                }}
                className="aspect-[9/16] bg-zinc-900 relative overflow-hidden cursor-pointer"
              >
                {video.thumbnail_url ? (
                  <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <video src={video.video_url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                )}
                {video.is_pinned && (
                  <span className="absolute top-1 left-1 text-xs">📌</span>
                )}
                <div className="absolute bottom-1 left-1 z-10">
                  <span className="text-[10px] font-semibold text-white bg-black/50 rounded px-1 py-0.5">
                    ▶ {video.views_count || 0}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <ProfileByUsername />
    </Suspense>
  )
}