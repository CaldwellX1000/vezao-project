'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isPrivate, setIsPrivate] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [username, setUsername] = useState('')

  const router = useRouter()
  const supabase = createClient()

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
        .select('username, is_private, is_admin')
        .eq('id', user.id)
        .single()

      if (profile) {
        setUsername(profile.username || '')
        setIsPrivate(!!profile.is_private)
        setIsAdmin(!!profile.is_admin)
      }
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
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black/95 backdrop-blur-md border-b border-white/10 px-4 h-12 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-lg font-bold">
          ←
        </button>
        <h1 className="font-semibold text-base">Settings</h1>
      </div>

      <div className="px-4 pt-5 space-y-6">
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
            <div className="px-4 py-3.5 flex items-center justify-between">
              <span className="text-sm text-gray-400">Email</span>
              <span className="text-sm font-medium truncate max-w-[60%] text-right">
                {email || '-'}
              </span>
            </div>
          </div>
        </section>

        {/* Privasi */}
        <section>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 px-1">
            Privasi
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
              <div
                className={`w-11 h-6 rounded-full relative transition shrink-0 ${
                  isPrivate ? 'bg-vezao-gradient' : 'bg-zinc-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${
                    isPrivate ? 'left-5' : 'left-0.5'
                  }`}
                />
              </div>
            </button>

            <button
              onClick={() => router.push('/blocked')}
              className="w-full px-4 py-3.5 flex items-center justify-between active:bg-white/5"
            >
              <span className="text-sm font-medium">Daftar diblokir</span>
              <span className="text-gray-500 text-lg">›</span>
            </button>
          </div>
        </section>

        {/* Lainnya */}
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
                <span className="text-sm font-medium text-purple-400">Admin Panel</span>
                <span className="text-gray-500 text-lg">›</span>
              </button>
            )}
            <button
              onClick={() => router.push('/profile')}
              className="w-full px-4 py-3.5 flex items-center justify-between active:bg-white/5 border-b border-white/5"
            >
              <span className="text-sm font-medium">Edit profil</span>
              <span className="text-gray-500 text-lg">›</span>
            </button>

            <button
              onClick={() => router.push('/profile?tab=liked')}
              className="w-full px-4 py-3.5 flex items-center justify-between active:bg-white/5 border-b border-white/5"
            >
              <span className="text-sm font-medium">Video tersimpan / liked</span>
              <span className="text-gray-500 text-lg">›</span>
            </button>

            <button
              onClick={handleLogout}
              className="w-full px-4 py-3.5 text-left text-sm text-red-400 font-medium active:bg-white/5"
            >
              Log out
            </button>
          </div>
        </section>

        <p className="text-center text-[11px] text-gray-600 pt-4">
          VEZAO · v1.0
        </p>
      </div>
    </div>
  )
}