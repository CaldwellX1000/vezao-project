import { NextResponse } from 'next/server'
// @ts-expect-error web-push tanpa type definitions resmi
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@vezao.fun',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { user_id, title, body: text, url } = body

    if (!user_id) {
      return NextResponse.json({ error: 'user_id required' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: 'Missing Supabase server env' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user_id)

    if (!subs?.length) {
      return NextResponse.json({ sent: 0 })
    }

    const payload = JSON.stringify({
      title: title || 'VEZAO',
      body: text || 'Ada aktivitas baru',
      url: url || '/',
    })

    let sent = 0
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: {
              p256dh: s.p256dh,
              auth: s.auth,
            },
          },
          payload
        )
        sent++
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', s.endpoint)
        }
      }
    }

    return NextResponse.json({ sent })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'fail' },
      { status: 500 }
    )
  }
}