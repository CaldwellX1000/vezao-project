'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [username, setUsername] = useState('')
  const [agreeAge, setAgreeAge] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isLogin, setIsLogin] = useState(true)
  const [isForgot, setIsForgot] = useState(false)
  const [isRecovery, setIsRecovery] = useState(false)
  const [isVerify, setIsVerify] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true)
        setIsForgot(false)
        setIsLogin(true)
        setIsVerify(false)
        setMessage('')
      }
    })

    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    if (hash.includes('type=recovery')) {
      setIsRecovery(true)
    }

    return () => subscription.unsubscribe()
  }, [])

  // Countdown resend OTP (60 detik)
  useEffect(() => {
    if (!isVerify || resendCooldown <= 0) return
    const t = setInterval(() => {
      setResendCooldown((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [isVerify, resendCooldown])

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otpCode.trim().length < 6) {
      setMessage('Masukkan kode 6 digit dari email')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: 'signup',
      })
      if (error) throw error
      setMessage('Verifikasi berhasil! Mengalihkan...')
      setTimeout(() => router.push('/'), 800)
    } catch (error: any) {
      setMessage(error.message || 'Kode salah atau sudah kadaluarsa')
    } finally {
      setLoading(false)
    }
  }

  const handleResendCode = async () => {
    if (resendCooldown > 0 || !email.trim()) return
    setLoading(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      })
      if (error) throw error
      setResendCooldown(60)
      setMessage('Kode baru sudah dikirim. Cek inbox/spam.')
    } catch (error: any) {
      setMessage(error.message || 'Gagal kirim ulang kode')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      if (isRecovery) {
        if (password.length < 6) {
          setMessage('Password minimal 6 karakter')
          return
        }
        if (password !== confirmPassword) {
          setMessage('Password dan konfirmasi tidak sama')
          return
        }
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setMessage('Password berhasil diubah! Mengalihkan...')
        setTimeout(() => router.push('/'), 1000)
        return
      }

      if (isForgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
        })
        if (error) throw error
        setMessage('Link reset password sudah dikirim ke email. Cek inbox/spam.')
      } else if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/')
      } else {
        if (!username.trim()) {
          setMessage('Username wajib diisi')
          return
        }
        if (username.trim().length < 3) {
          setMessage('Username minimal 3 karakter')
          return
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
          setMessage('Username hanya huruf, angka, dan underscore')
          return
        }
        if (password.length < 6) {
          setMessage('Password minimal 6 karakter')
          return
        }
        if (password !== confirmPassword) {
          setMessage('Password dan konfirmasi tidak sama')
          return
        }
        if (!agreeAge) {
          setMessage('Kamu harus konfirmasi berusia 18 tahun atau lebih')
          return
        }

        const uname = username.trim().toLowerCase().replace(/^@/, '')

        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .ilike('username', uname)
          .maybeSingle()

        if (existing) {
          setMessage('Username sudah dipakai, pilih yang lain')
          return
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              username: uname,
              full_name: uname,
            },
          },
        })
        if (error) throw error

        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            username: uname,
            full_name: uname,
          })
        }

        setIsVerify(true)
        setResendCooldown(60)
        setMessage('Kode 6 digit sudah dikirim ke email. Masukkan di bawah.')
        setPassword('')
        setConfirmPassword('')
        setUsername('')
        setAgreeAge(false)
      }
    } catch (error: any) {
      setMessage(error.message || 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  if (isVerify) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black px-4">
        <div className="bg-zinc-900 p-8 rounded-2xl shadow-lg w-full max-w-md border border-white/10">
          <div className="flex justify-center mb-4">
            <img src="/icon.png" alt="VEZAO" className="w-14 h-14 rounded-2xl object-cover" />
          </div>
          <h2 className="text-xl font-bold text-center mb-1 text-white tracking-wide">
            VERIFIKASI EMAIL
          </h2>
          <p className="text-center text-sm text-gray-400 mb-6">
            Masukkan kode 6 digit yang dikirim ke
            <br />
            <span className="text-white font-medium">{email}</span>
          </p>

          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">
                Kode verifikasi
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-center text-2xl tracking-[0.4em] placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="000000"
                autoFocus
              />
            </div>

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
              disabled={loading || otpCode.length < 6}
              className="w-full bg-vezao-gradient text-white py-2.5 rounded-xl font-medium disabled:opacity-50"
            >
              {loading ? 'Memverifikasi...' : 'Verifikasi'}
            </button>
          </form>

          <button
            type="button"
            onClick={handleResendCode}
            disabled={loading || resendCooldown > 0}
            className="w-full mt-3 text-sm text-purple-400 hover:text-purple-300 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            {resendCooldown > 0
              ? `Kirim ulang kode (${resendCooldown}s)`
              : 'Kirim ulang kode'}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsVerify(false)
              setIsLogin(true)
              setOtpCode('')
              setMessage('')
              setResendCooldown(0)
            }}
            className="w-full mt-3 text-sm text-gray-400 hover:text-white"
          >
            Kembali ke Login
          </button>
        </div>
      </div>
    )
  }

  const title = isRecovery
    ? 'Set Password Baru'
    : isForgot
    ? 'Lupa Password'
    : isLogin
    ? 'Login'
    : 'BUAT AKUN'

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="bg-zinc-900 p-8 rounded-2xl shadow-lg w-full max-w-md border border-white/10">
        <div className="flex justify-center mb-4">
          <img src="/icon.png" alt="VEZAO" className="w-14 h-14 rounded-2xl object-cover" />
        </div>
        <h2 className="text-xl font-bold text-center mb-1 text-white tracking-wide">{title}</h2>
        {!isLogin && !isForgot && !isRecovery && (
          <p className="text-center text-sm text-gray-400 mb-6">Mulai perjalanan kamu</p>
        )}
        {(isLogin || isForgot || isRecovery) && <div className="mb-6" />}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isRecovery && (
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Gmail / Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="email@gmail.com"
              />
            </div>
          )}

          {!isLogin && !isForgot && !isRecovery && (
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value.replace(/\s/g, '').replace(/^@/, ''))
                }
                required
                minLength={3}
                maxLength={24}
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Pilih username"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Huruf, angka, underscore. Tanpa spasi & tanpa @.
              </p>
            </div>
          )}

          {(isRecovery || (!isForgot && !isRecovery)) && (
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">
                {isRecovery ? 'Password baru' : 'Password'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2.5 pr-12 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Minimal 6 karakter"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showPassword ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {((!isLogin && !isForgot) || isRecovery) && (
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">
                Konfirmasi Password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2.5 pr-12 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Ulangi password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showConfirm ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {!isLogin && !isForgot && !isRecovery && (
            <label className="flex items-start gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={agreeAge}
                onChange={(e) => setAgreeAge(e.target.checked)}
                className="mt-1 rounded border-zinc-600"
              />
              <span>
                Saya berusia <strong className="text-white">18 tahun</strong> atau lebih dan setuju
                dengan ketentuan penggunaan VEZAO.
              </span>
            </label>
          )}

          {message && (
            <div
              className={`text-sm p-3 rounded-xl ${
                message.includes('berhasil') ||
                message.includes('dikirim') ||
                message.includes('verifikasi')
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
            className="w-full bg-vezao-gradient text-white py-2.5 rounded-xl font-medium disabled:opacity-50 active:scale-[0.98] transition"
          >
            {loading
              ? 'Loading...'
              : isRecovery
              ? 'Simpan Password Baru'
              : isForgot
              ? 'Kirim Link Reset'
              : isLogin
              ? 'Login'
              : 'Buat Akun'}
          </button>
        </form>

        {!isRecovery && (
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
                    setConfirmPassword('')
                    setUsername('')
                    setAgreeAge(false)
                  }}
                  className="text-purple-400 font-medium hover:underline"
                >
                  {isLogin ? 'Daftar' : 'Login'}
                </button>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}