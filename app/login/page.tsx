'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLogin, setIsLogin] = useState(true)
  const [isForgot, setIsForgot] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      if (isForgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
        })
        if (error) throw error
        setMessage('Link reset password sudah dikirim ke email kamu. Cek inbox/spam.')
      } else if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/')
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage('Registrasi berhasil! Silakan login.')
        setIsLogin(true)
      }
    } catch (error: any) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="bg-zinc-900 p-8 rounded-2xl shadow-lg w-full max-w-md border border-white/10">
        <h1 className="text-2xl font-bold text-center mb-2 bg-vezao-gradient bg-clip-text text-transparent">
          VEZAO
        </h1>
        <h2 className="text-lg font-semibold text-center mb-6 text-white">
          {isForgot ? 'Lupa Password' : isLogin ? 'Login' : 'Daftar Akun'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="email@contoh.com"
            />
          </div>

          {!isForgot && (
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Minimal 6 karakter"
              />
            </div>
          )}

          {message && (
            <div
              className={`text-sm p-3 rounded-xl ${
                message.includes('berhasil') || message.includes('dikirim')
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-vezao-gradient text-white py-2.5 rounded-xl font-medium disabled:opacity-50"
          >
            {loading
              ? 'Loading...'
              : isForgot
              ? 'Kirim Link Reset'
              : isLogin
              ? 'Login'
              : 'Daftar'}
          </button>
        </form>

        <div className="mt-5 space-y-2 text-center text-sm">
          {isLogin && !isForgot && (
            <button
              onClick={() => {
                setIsForgot(true)
                setMessage('')
              }}
              className="text-purple-400 hover:underline"
            >
              Lupa Password?
            </button>
          )}

          {isForgot ? (
            <button
              onClick={() => {
                setIsForgot(false)
                setMessage('')
              }}
              className="text-gray-400 hover:underline block w-full"
            >
              Kembali ke Login
            </button>
          ) : (
            <p className="text-gray-400">
              {isLogin ? 'Belum punya akun?' : 'Sudah punya akun?'}{' '}
              <button
                onClick={() => {
                  setIsLogin(!isLogin)
                  setMessage('')
                }}
                className="text-purple-400 font-medium hover:underline"
              >
                {isLogin ? 'Daftar' : 'Login'}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}