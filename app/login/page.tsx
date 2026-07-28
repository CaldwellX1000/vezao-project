'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const COUNTRIES = [
  'Indonesia',
  'Malaysia',
  'Singapore',
  'Thailand',
  'Philippines',
  'Vietnam',
  'Lainnya',
]

const GENDERS = ['Laki-laki', 'Perempuan', 'Lainnya']

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [username, setUsername] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [country, setCountry] = useState('')
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
  const [resendCountdown, setResendCountdown] = useState(0)
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

  useEffect(() => {
    if (!isVerify || resendCountdown <= 0) return
    const t = setInterval(() => {
      setResendCountdown((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [isVerify, resendCountdown])

  const resetRegisterFields = () => {
    setPassword('')
    setConfirmPassword('')
    setUsername('')
    setAge('')
    setGender('')
    setCountry('')
    setAgreeAge(false)
  }

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
    if (resendCountdown > 0 || !email.trim()) return
    setLoading(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      })
      if (error) throw error
      setResendCountdown(60)
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
        if (!email.trim()) {
          setMessage('Email wajib diisi')
          return
        }
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
        const ageNum = parseInt(age, 10)
        if (!age || isNaN(ageNum) || ageNum < 18) {
          setMessage('Umur minimal 18 tahun')
          return
        }
        if (!gender) {
          setMessage('Pilih jenis kelamin')
          return
        }
        if (!country) {
          setMessage('Pilih negara')
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
            age: ageNum,
            gender,
            country,
          })
        }

        setIsVerify(true)
        setResendCountdown(60)
        setMessage('Kode 6 digit sudah dikirim ke email. Masukkan di bawah.')
        resetRegisterFields()
      }
    } catch (error: any) {
      setMessage(error.message || 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full px-4 py-3 bg-zinc-800/80 border border-zinc-700/80 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/80 focus:border-transparent transition'
  const labelClass = 'block text-sm font-medium mb-1.5 text-gray-300'

  if (isVerify) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black px-4">
        <div className="bg-zinc-900/95 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-white/10">
          <div className="flex justify-center mb-5">
            <img src="/icon.png" alt="VEZAO" className="w-14 h-14 rounded-2xl object-cover" />
          </div>
          <h2 className="text-2xl font-bold text-center mb-1 text-white tracking-wide">
            VERIFIKASI EMAIL
          </h2>
          <p className="text-center text-sm text-gray-400 mb-6 leading-relaxed">
            Masukkan kode 6 digit yang dikirim ke
            <br />
            <span className="text-white font-medium">{email}</span>
          </p>

          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className={labelClass}>Kode verifikasi</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                className={`${inputClass} text-center text-2xl tracking-[0.4em]`}
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
              className="w-full bg-vezao-gradient text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
            >
              {loading ? 'Memverifikasi...' : 'Verifikasi'}
            </button>
          </form>

          <button
            type="button"
            onClick={handleResendCode}
            disabled={loading || resendCountdown > 0}
            className="w-full mt-3 text-sm text-purple-400 hover:text-purple-300 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            {resendCountdown > 0
              ? `Kirim ulang kode (${resendCountdown}s)`
              : 'Kirim ulang kode'}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsVerify(false)
              setIsLogin(true)
              setOtpCode('')
              setMessage('')
              setResendCountdown(0)
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
    : 'Buat Akun'

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4 py-10">
      <div className="bg-zinc-900/95 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-white/10">
        <div className="flex justify-center mb-5">
          <img src="/icon.png" alt="VEZAO" className="w-14 h-14 rounded-2xl object-cover" />
        </div>
        <h2 className="text-2xl font-bold text-center text-white tracking-wide">{title}</h2>
        {!isLogin && !isForgot && !isRecovery && (
          <p className="text-center text-sm text-gray-400 mt-1 mb-6">Platfrom Media Sosial</p>
        )}
        {(isLogin || isForgot || isRecovery) && <div className="mb-6" />}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isRecovery && (
            <div>
              <label className={labelClass}>
                {!isLogin && !isForgot ? 'Gmail / Email' : 'Email'}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClass}
                placeholder="email@gmail.com"
              />
            </div>
          )}

          {!isLogin && !isForgot && !isRecovery && (
            <>
              <div>
                <label className={labelClass}>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) =>
                    setUsername(e.target.value.replace(/\s/g, '').replace(/^@/, ''))
                  }
                  required
                  minLength={3}
                  maxLength={24}
                  className={inputClass}
                  placeholder="Pilih username"
                />
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Huruf, angka, underscore · tanpa spasi & tanpa @
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Umur</label>
                  <input
                    type="number"
                    min={18}
                    max={120}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    required
                    className={inputClass}
                    placeholder="18+"
                  />
                </div>
                <div>
                  <label className={labelClass}>Jenis Kelamin</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    required
                    className={`${inputClass} appearance-none`}
                  >
                    <option value="" disabled>
                      Pilih
                    </option>
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>Negara</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  required
                  className={`${inputClass} appearance-none`}
                >
                  <option value="" disabled>
                    Pilih Negara
                  </option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {(isRecovery || (!isForgot && !isRecovery)) && (
            <div>
              <label className={labelClass}>
                {isRecovery ? 'Password baru' : 'Kata Sandi'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className={`${inputClass} pr-12`}
                  placeholder={isRecovery ? 'Password baru' : 'Buat kata sandi'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-1"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {((!isLogin && !isForgot) || isRecovery) && (
            <div>
              <label className={labelClass}>Konfirmasi Kata Sandi</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className={`${inputClass} pr-12`}
                  placeholder="Konfirmasi kata sandi"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-1"
                >
                  {showConfirm ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {!isLogin && !isForgot && !isRecovery && (
            <label className="flex items-start gap-2.5 text-sm text-gray-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={agreeAge}
                onChange={(e) => setAgreeAge(e.target.checked)}
                className="mt-0.5 rounded border-zinc-600 accent-purple-500"
              />
              <span className="leading-relaxed">
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
            className="w-full bg-vezao-gradient text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition mt-1"
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
                    resetRegisterFields()
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