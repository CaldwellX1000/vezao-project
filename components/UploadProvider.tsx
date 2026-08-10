'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import { toast } from '@/lib/toast'

type UploadJob = {
  progress: number
  status: 'idle' | 'uploading' | 'done' | 'error'
}

const UploadCtx = createContext<{
  job: UploadJob
  startUpload: (fn: (onProgress: (n: number) => void) => Promise<void>) => void
} | null>(null)

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [job, setJob] = useState<UploadJob>({ progress: 0, status: 'idle' })

  const startUpload = useCallback(
    (fn: (onProgress: (n: number) => void) => Promise<void>) => {
      setJob({ progress: 0, status: 'uploading' })
      fn((n) => setJob((j) => ({ ...j, progress: n })))
        .then(() => {
          setJob({ progress: 100, status: 'done' })
          toast('Video berhasil diupload', 'success')
          setTimeout(() => setJob({ progress: 0, status: 'idle' }), 2000)
        })
        .catch((e) => {
          setJob({ progress: 0, status: 'error' })
          toast(e?.message || 'Upload gagal', 'error')
        })
    },
    []
  )

  return (
    <UploadCtx.Provider value={{ job, startUpload }}>
      {children}
      {job.status === 'uploading' && (
        <div className="fixed bottom-20 left-4 z-[200] md:bottom-6 max-w-xs rounded-2xl bg-zinc-900 border border-white/10 px-4 py-3 shadow-xl">
          <p className="text-xs font-medium text-white">Mengupload video…</p>
          <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-vezao-gradient transition-all"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      )}
    </UploadCtx.Provider>
  )
}

export function useUpload() {
  const ctx = useContext(UploadCtx)
  if (!ctx) throw new Error('useUpload outside provider')
  return ctx
}