'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type StoryUser = {
  user_id: string
  username: string | null
  avatar_url: string | null
  hasStory: boolean
  isMe: boolean
  allSeen: boolean
}

export default function StoryBar() {
  const [items, setItems] = useState<StoryUser[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: stories } = await supabase
        .from('stories')
        .select('user_id')
        .gt('expires_at', new Date().toISOString())

      const storyUserIds = [...new Set((stories || []).map((s) => s.user_id))]

      const orderedIds = [
        user.id,
        ...storyUserIds.filter((id) => id !== user.id),
      ]

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', orderedIds)

      const map = new Map((profiles || []).map((p) => [p.id, p]))
      const storySet = new Set(storyUserIds)

      // User yang semua story-nya sudah dilihat
      const seenUserIds = new Set<string>()
      if (storyUserIds.length > 0) {
        const { data: myViews } = await supabase
          .from('story_views')
          .select('story_id')
          .eq('viewer_id', user.id)

        const seenStoryIds = new Set((myViews || []).map((v) => v.story_id))

        const { data: allActive } = await supabase
          .from('stories')
          .select('id, user_id')
          .gt('expires_at', new Date().toISOString())
          .in('user_id', storyUserIds)

        const byUser = new Map<string, string[]>()
        ;(allActive || []).forEach((s) => {
          const arr = byUser.get(s.user_id) || []
          arr.push(s.id)
          byUser.set(s.user_id, arr)
        })

        byUser.forEach((ids, uid) => {
          if (ids.length > 0 && ids.every((id) => seenStoryIds.has(id))) {
            seenUserIds.add(uid)
          }
        })
      }

      setItems(
        orderedIds.map((uid) => {
          const p = map.get(uid)
          return {
            user_id: uid,
            username: p?.username || 'user',
            avatar_url: p?.avatar_url || null,
            hasStory: storySet.has(uid),
            isMe: uid === user.id,
            allSeen: seenUserIds.has(uid),
          }
        })
      )
    }

    load()
  }, [])

  if (items.length === 0) return null

  return (
    <div className="w-full overflow-x-auto px-3 pt-2 pb-1 scrollbar-hide">
      <div className="flex gap-3 min-w-max">
        {items.map((item) => (
          <button
            key={item.user_id}
            onClick={() => {
              if (item.isMe && !item.hasStory) {
                router.push('/story/create')
              } else {
                router.push(`/story/view?userId=${item.user_id}`)
              }
            }}
            className="flex flex-col items-center gap-1 w-16 shrink-0"
          >
            <div
              className={`w-14 h-14 rounded-full p-[2px] ${
                item.hasStory
                  ? item.allSeen
                    ? 'bg-zinc-500'
                    : 'bg-vezao-gradient'
                  : 'bg-zinc-600'
              }`}
            >
              <div className="w-full h-full rounded-full bg-black p-[2px] relative">
                <div className="w-full h-full rounded-full overflow-hidden bg-zinc-800">
                  {item.avatar_url ? (
                    <img
                      src={item.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold bg-vezao-gradient">
                      {(item.username || 'U')[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                {item.isMe && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push('/story/create')
                    }}
                    className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-vezao-gradient text-white text-sm leading-none flex items-center justify-center border-2 border-black"
                  >
                    +
                  </span>
                )}
              </div>
            </div>
            <span className="text-[10px] text-gray-300 truncate w-full text-center">
              {item.isMe ? 'Cerita kamu' : `@${item.username}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}