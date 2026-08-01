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

  await supabase.from('notifications').insert({
    user_id: row.user_id,
    actor_id: row.actor_id,
    type: row.type,
    video_id: row.video_id ?? null,
    message: row.message ?? null,
    is_read: false,
  })
}