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

function pushBodyForType(
  type: string,
  actorName: string,
  message?: string | null
) {
  const name = actorName || 'Seseorang'
  const preview = (message || '').trim().slice(0, 80)

  switch (type) {
    case 'like':
      return `${name} menyukai videomu`
    case 'comment':
      return preview ? `${name}: ${preview}` : `${name} mengomentari videomu`
    case 'mention':
      return preview ? `${name} menyebutmu: ${preview}` : `${name} menyebutmu`
    case 'follow':
      return `${name} mulai mengikuti kamu`
    case 'follow_request':
      return `${name} meminta mengikuti kamu`
    case 'save':
      return `${name} menyimpan videomu`
    case 'share':
      return `${name} membagikan videomu`
    default:
      return `${name} — aktivitas baru di VEZAO`
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

  // Nama actor untuk teks push
  let actorName = 'Seseorang'
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, full_name')
      .eq('id', row.actor_id)
      .maybeSingle()

    if (profile?.username) actorName = `@${profile.username}`
    else if (profile?.full_name) actorName = profile.full_name
  } catch {}

  // Web Push
  try {
    if (typeof window !== 'undefined') {
      void fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: row.user_id,
          title: 'VEZAO',
          body: pushBodyForType(row.type, actorName, row.message),
          url: row.video_id ? `/v/${row.video_id}` : '/notifications',
        }),
      })
    }
  } catch {}
}