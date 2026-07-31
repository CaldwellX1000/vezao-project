'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'

type NotifPrefs = {
  likes: boolean
  comments: boolean
  follows: boolean
  messages: boolean
}

const DEFAULT_NOTIF: NotifPrefs = {
  likes: true,
  comments: true,
  follows: true,
  messages: true,
}

function Toggle({
  on,
  disabled,
}: {
  on: boolean
  disabled?: boolean
}) {
  return (
    <div
      className={`w-11 h-6 rounded-full relative transition shrink-0 ${
        on ? 'bg-vezao-gradient' : 'bg-zinc-600'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${
          on ? 'left-5' : 'left-0.5'
        }`}
      />
    </div>
  )
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isPrivate, setIsPrivate] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [notif, setNotif] = useState<NotifPrefs>(DEFAULT_NOTIF)
  const [resetMsg, setResetMsg] = useState('')

  const router = useRouter()
  const supabase = createClient()
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      setEmail(user.email ?? null)

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, full_name, is_private, is_admin')
        .eq('id', user.id)
        .single()

      if (profile) {
        setUsername(profile.username || '')
        setFullName(profile.full_name || '')
        setIsPrivate(!!profile.is_private)
        setIsAdmin(!!profile.is_admin)
      }

      try {
        const raw = localStorage.getItem('vezao_notif_prefs')
        if (raw) setNotif({ ...DEFAULT_NOTIF, ...JSON.parse(raw) })
      } catch {}

      setLoading(false)
    }
    load()
  }, [])

  const togglePrivate = async () => {
    setSaving(true)
    const next = !isPrivate
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('profiles')
      .update({ is_private: next })
      .eq('id', user.id)

    if (!error) setIsPrivate(next)
    else alert('Gagal simpan: ' + error.message)
    setSaving(false)
  }

  const toggleNotif = (key: keyof NotifPrefs) => {
    setNotif((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        localStorage.setItem('vezao_notif_prefs', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const handleResetPassword = async () => {
    if (!email) {
      alert('Email tidak ditemukan')
      return
    }
    setResetMsg('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    if (error) setResetMsg(error.message)
    else setResetMsg('Link reset password sudah dikirim ke email kamu.')
  }

  const handleLogout = async () => {
    const ok = confirm('Yakin mau log out?')
    if (!ok) return
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="sticky top-0 z-50 bg-black/95 backdrop-blur-md border-b border-white/10 px-4 h-12 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-lg font-bold w-8">
          ←
        </button>
        <h1 className="font-semibold text-base">Settings</h1>
      </div>

      <div className="px-4 pt-5 space-y-6 max-w-lg mx-auto">
        {/* Profile summary */}
        <button
          onClick={() => router.push('/profile')}
          className="w-full flex items-center gap-3 p-3 rounded-2xl bg-zinc-900 border border-white/5 active:bg-white/5"
        >
          <div className="w-12 h-12 rounded-full bg-vezao-gradient flex items-center justify-center text-lg font-bold shrink-0">
            {(fullName || username || 'U')[0]?.toUpperCase()}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="font-semibold text-sm truncate">
              {fullName || username || 'User'}
            </p>
            <p className="text-xs text-gray-400 truncate">@{username || 'user'}</p>
          </div>
          <span className="text-xs text-purple-400 shrink-0">Edit profil ›</span>
        </button>

        {/* Akun */}
        <section>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 px-1">
            Akun
          </p>
          <div className="bg-zinc-900 rounded-2xl overflow-hidden border border-white/5">
            <div className="px-4 py-3.5 flex items-center justify-between border-b border-white/5">
              <span className="text-sm text-gray-400">Username</span>
              <span className="text-sm font-medium">@{username || 'user'}</span>
            </div>
            <div className="px-4 py-3.5 flex items-center justify-between border-b border-white/5">
              <span className="text-sm text-gray-400">Email</span>
              <span className="text-sm font-medium truncate max-w-[55%] text-right">
                {email || '-'}
              </span>
            </div>
            <button
              onClick={handleResetPassword}
              className="w-full px-4 py-3.5 flex items-center justify-between active:bg-white/5"
            >
              <span className="text-sm font-medium">Ganti password</span>
              <span className="text-gray-500 text-lg">›</span>
            </button>
            {resetMsg && (
              <p className="px-4 pb-3 text-xs text-purple-400">{resetMsg}</p>
            )}
          </div>
        </section>

        {/* Privasi */}
        <section>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 px-1">
            Privasi & keamanan
          </p>
          <div className="bg-zinc-900 rounded-2xl overflow-hidden border border-white/5">
            <button
              onClick={togglePrivate}
              disabled={saving}
              className="w-full px-4 py-3.5 flex items-center justify-between active:bg-white/5 border-b border-white/5 disabled:opacity-50"
            >
              <div className="text-left pr-3">
                <p className="text-sm font-medium">Akun Private</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Hanya follower yang bisa lihat video kamu
                </p>
              </div>
              <Toggle on={isPrivate} disabled={saving} />
            </button>

            <button
              onClick={() => router.push('/blocked')}
              className="w-full px-4 py-3.5 flex items-center justify-between active:bg-white/5 border-b border-white/5"
            >
              <div className="text-left">
                <p className="text-sm font-medium">Daftar diblokir</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Kelola user yang kamu blokir
                </p>
              </div>
              <span className="text-gray-500 text-lg">›</span>
            </button>

            <button
              onClick={() => router.push('/profile')}
              className="w-full px-4 py-3.5 flex items-center justify-between active:bg-white/5"
            >
              <span className="text-sm font-medium">Video liked & draft</span>
              <span className="text-gray-500 text-lg">›</span>
            </button>
          </div>
        </section>

        {/* Notifikasi (preferensi lokal) */}
        <section>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 px-1">
            Notifikasi
          </p>
          <div className="bg-zinc-900 rounded-2xl overflow-hidden border border-white/5">
            {(
              [
                { key: 'likes' as const, label: 'Suka', desc: 'Saat video kamu di-like' },
                {
                  key: 'comments' as const,
                  label: 'Komentar',
                  desc: 'Komentar & balasan',
                },
                {
                  key: 'follows' as const,
                  label: 'Follow',
                  desc: 'Follow baru & request',
                },
                {
                  key: 'messages' as const,
                  label: 'Pesan',
                  desc: 'Chat masuk',
                },
              ] as const
            ).map((item, i, arr) => (
              <button
                key={item.key}
                onClick={() => toggleNotif(item.key)}
                className={`w-full px-4 py-3.5 flex items-center justify-between active:bg-white/5 ${
                  i < arr.length - 1 ? 'border-b border-white/5' : ''
                }`}
              >
                <div className="text-left pr-3">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                </div>
                <Toggle on={notif[item.key]} />
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-600 mt-2 px-1">
            Preferensi disimpan di perangkat ini (nanti bisa disambung server).
          </p>
        </section>

        {/* Tampilan */}
        <section>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 px-1">
            Tampilan
          </p>
          <div className="bg-zinc-900 rounded-2xl overflow-hidden border border-white/5">
            <div className="px-4 py-3.5 flex items-center justify-between gap-3">
              <div className="text-left pr-2">
                <p className="text-sm font-medium">Mode tampilan</p>
                <p className="text-xs text-gray-500 mt-0.5">Gelap atau cerah</p>
              </div>
              <div className="flex rounded-full bg-zinc-800 p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                    theme === 'dark'
                      ? 'bg-vezao-gradient text-white'
                      : 'text-gray-400'
                  }`}
                >
                  Gelap
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                    theme === 'light'
                      ? 'bg-vezao-gradient text-white'
                      : 'text-gray-400'
                  }`}
                >
                  Cerah
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Admin + tentang */}
        <section>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 px-1">
            Lainnya
          </p>
          <div className="bg-zinc-900 rounded-2xl overflow-hidden border border-white/5">
            {isAdmin && (
              <button
                onClick={() => router.push('/admin')}
                className="w-full px-4 py-3.5 flex items-center justify-between active:bg-white/5 border-b border-white/5"
              >
                <div className="text-left">
                  <p className="text-sm font-medium text-purple-400">Admin Panel</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Moderasi & analytics
                  </p>
                </div>
                <span className="text-gray-500 text-lg">›</span>
              </button>
            )}
            <button
              onClick={() => router.push('/')}
              className="w-full px-4 py-3.5 flex items-center justify-between active:bg-white/5 border-b border-white/5"
            >
              <span className="text-sm font-medium">Bantuan / FAQ</span>
              <span className="text-gray-500 text-lg">›</span>
            </button>
            <div className="px-4 py-3.5 flex items-center justify-between border-b border-white/5">
              <span className="text-sm text-gray-400">Versi</span>
              <span className="text-sm text-gray-500">VEZAO 1.0</span>
            </div>
            <button
              onClick={handleLogout}
              className="w-full px-4 py-3.5 text-left text-sm text-red-400 font-medium active:bg-white/5"
            >
              Log out
            </button>
          </div>
        </section>

        <p className="text-center text-[11px] text-gray-600 pt-2 pb-6">
          vezao.fun
        </p>
      </div>
    </div>
  )
}