import { createClient } from '@/lib/supabase'

/** Publish video milik user yang scheduled_at sudah lewat. */
export async function publishDueScheduledVideos(userId?: string) {
  const supabase = createClient()
  const now = new Date().toISOString()

  let q = supabase
    .from('videos')
    .select('id, user_id')
    .eq('is_draft', true)
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', now)

  if (userId) q = q.eq('user_id', userId)

  const { data } = await q.limit(20)
  if (!data?.length) return 0

  let n = 0
  for (const row of data) {
    const { error } = await supabase
      .from('videos')
      .update({ is_draft: false, scheduled_at: null })
      .eq('id', row.id)
      .eq('user_id', row.user_id)
    if (!error) n++
  }
  return n
}