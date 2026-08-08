'use client'

import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Sudah dibuka sebagai PWA?
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    if (standalone) {
      setInstalled(true)
      return
    }

    // User pernah tutup banner?
    if (localStorage.getItem('serulo_install_dismissed') === '1') return

    const ua = navigator.userAgent || ''
    const ios = /iPad|iPhone|iPod/.test(ua)
    setIsIOS(ios)

    if (ios) {
      setVisible(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const dismiss = () => {
    setVisible(false)
    localStorage.setItem('serulo_install_dismissed', '1')
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    const choice = await deferred.userChoice
    setDeferred(null)
    setVisible(false)
    if (choice.outcome === 'accepted') {
      setInstalled(true)
    }
  }

  if (installed || !visible) return null

  return (
    <div className="fixed bottom-20 left-3 right-3 z-[90] max-w-[480px] mx-auto">
      <div className="bg-zinc-900 border border-white/15 rounded-2xl p-4 shadow-xl flex gap-3 items-start">
        <div className="w-11 h-11 rounded-xl overflow-hidden bg-zinc-800 shrink-0 border border-white/10">
          <img
            src="/icon-192.png"
            alt="SERULO"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Pasang SERULO</p>
          {isIOS ? (
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Safari → tombol Share → <span className="text-white">Add to Home Screen</span>
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-1">
              Tambah ke layar utama biar lebih cepat dibuka
            </p>
          )}
          <div className="flex gap-2 mt-3">
            {!isIOS && deferred && (
              <button
                onClick={install}
                className="bg-vezao-gradient text-white text-xs font-semibold px-4 py-2 rounded-full"
              >
                Pasang
              </button>
            )}
            <button
              onClick={dismiss}
              className="text-xs text-gray-400 px-3 py-2"
            >
              Nanti
            </button>
          </div>
        </div>
        <button onClick={dismiss} className="text-gray-500 text-sm shrink-0">
          ✕
        </button>
      </div>
    </div>
  )
}