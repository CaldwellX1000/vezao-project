export type ToastType = 'success' | 'error' | 'info'

export function toast(message: string, type: ToastType = 'info') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('vezao-toast', {
      detail: { message, type },
    })
  )
}