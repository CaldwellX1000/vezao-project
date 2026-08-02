'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export default function PushEnable() {
  const [status, setStatus] = useState<'idle' | 'on' | 'denied' | 'unsupported'>('idle')
  const supabase = createClient()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported')
      return
    }
    if (Notification.permission === 'granted') setStatus('on')
    if (Notification.permission === 'denied') setStatus('denied')
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  const enable = async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus('denied')
        return
      }

      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!key) {
        toast('VAPID public key belum di-set', 'error')
        return
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      })

      const json = sub.toJSON()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user || !json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return

      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('endpoint', json.endpoint)

      const { error } = await supabase.from('push_subscriptions').insert({
        user_id: user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      })

      if (error) {
        toast('Gagal simpan: ' + error.message, 'error')
        return
      }
      setStatus('on')
      toast('Notifikasi aktif', 'success')
    } catch (e: any) {
      toast(e?.message || 'Gagal aktifkan notifikasi', 'error')
    }
  }

  if (status === 'unsupported') return null

  return (
    <button
      type="button"
      onClick={enable}
      className="w-full text-left px-4 py-3 rounded-xl bg-zinc-900 border border-white/10 text-sm"
    >
      {status === 'on'
        ? '🔔 Notifikasi aktif'
        : status === 'denied'
        ? 'Notifikasi diblokir di browser — buka pengaturan situs'
        : 'Aktifkan notifikasi push'}
    </button>
  )
}