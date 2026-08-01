import { createClient } from '@/lib/supabase'

type SupabaseClient = ReturnType<typeof createClient>

/** true = boleh kirim notif (tidak saling blokir) */
export async function canNotify(
  supabase: SupabaseClient,
  actorId: string,
  targetUserId: string
): Promise<boolean> {
  if (!actorId || !targetUserId || actorId === targetUserId) return false

  const { data } = await supabase
    .from('blocks')
    .select('id')
    .or(
      `and(blocker_id.eq.${actorId},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${actorId})`
    )
    .limit(1)

  return !data || data.length === 0
}

function pushBodyForType(type: string) {
  switch (type) {
    case 'like':
      return 'Seseorang menyukai videomu'
    case 'comment':
      return 'Komentar baru di videomu'
    case 'follow':
      return 'Ada follower baru'
    case 'follow_request':
      return 'Permintaan follow baru'
    case 'save':
      return 'Videomu disimpan seseorang'
    default:
      return 'Ada aktivitas baru'
  }
}

export async function insertNotification(
  supabase: SupabaseClient,
  row: {
    user_id: string
    actor_id: string
    type: string
    video_id?: string | null
    message?: string | null
  }
) {
  const ok = await canNotify(supabase, row.actor_id, row.user_id)
  if (!ok) return

  const { error } = await supabase.from('notifications').insert({
    user_id: row.user_id,
    actor_id: row.actor_id,
    type: row.type,
    video_id: row.video_id ?? null,
    message: row.message ?? null,
    is_read: false,
  })

  if (error) {
    console.error('insertNotification', error)
    return
  }

  // Web Push (fire-and-forget)
  try {
    if (typeof window !== 'undefined') {
      void fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: row.user_id,
          title: 'VEZAO',
          body: pushBodyForType(row.type),
          url: row.video_id ? `/v/${row.video_id}` : '/',
        }),
      })
    }
  } catch {}
}