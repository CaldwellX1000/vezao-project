'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'

const DISMISS_KEY = 'serulo_push_prompt_dismissed'

export default function PushPrompt() {
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const check = async () => {
      if (typeof window === 'undefined') return
      if (!('Notification' in window) || !('serviceWorker' in navigator)) return

      // Jangan tampil di halaman auth
      const path = window.location.pathname
      if (
        path.startsWith('/login') ||
        path.startsWith('/signup') ||
        path.startsWith('/register')
      ) {
        return
      }

      if (localStorage.getItem(DISMISS_KEY) === '1') return
      if (Notification.permission === 'denied') return

      // Wajib sudah login
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      if (Notification.permission === 'granted') {
        const { count } = await supabase
          .from('push_subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)

        if ((count || 0) > 0) return
        // granted tapi belum ada di DB → boleh tampil lagi biar user subscribe
      }

      setShow(true)
    }

    const t = setTimeout(check, 1500)
    return () => clearTimeout(t)
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setShow(false)
  }

  const enable = async () => {
    setLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        toast('Login dulu untuk aktifkan notifikasi', 'error')
        setLoading(false)
        return
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        toast('Izin notifikasi ditolak. Aktifkan lewat Settings browser.', 'error')
        setLoading(false)
        return
      }

      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        toast('VAPID key belum diset', 'error')
        setLoading(false)
        return
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      const json = sub.toJSON()
      // Hapus subscription lama user ini (opsional, biar rapi)
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('endpoint', json.endpoint!)

      const { error } = await supabase.from('push_subscriptions').insert({
        user_id: user.id,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      })

      if (error) {
        toast('Gagal simpan: ' + error.message, 'error')
        setLoading(false)
        return
      }

      localStorage.removeItem(DISMISS_KEY)
      setShow(false)
      toast('Notifikasi aktif!', 'success')
    } catch (e: any) {
      toast(e?.message || 'Gagal aktifkan notifikasi', 'error')
    }
    setLoading(false)
  }

  if (!show) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] px-3 pt-3 pointer-events-none">
      <div className="max-w-[480px] mx-auto pointer-events-auto bg-zinc-900 border border-white/15 rounded-2xl shadow-xl p-3 flex items-start gap-3">
        <img
          src="/fav.png"
          alt="SERULO"
          className="w-10 h-10 rounded-xl object-cover shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Aktifkan notifikasi</p>
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
            Dapatkan pemberitahuan dari SERULO.
          </p>
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={enable}
              disabled={loading}
              className="bg-vezao-gradient text-white text-xs font-semibold px-3.5 py-1.5 rounded-full disabled:opacity-50"
            >
              {loading ? '...' : 'Aktifkan'}
            </button>
            <button
              onClick={dismiss}
              className="text-xs text-gray-400 px-2 py-1.5"
            >
              Nanti
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="text-gray-500 text-sm shrink-0 leading-none pt-0.5"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}