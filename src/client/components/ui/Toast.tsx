export type ToastType = 'success' | 'error'

/**
 * Shows a transient toast notification appended to `document.body`.
 * Same UX/timing as the local copies previously duplicated across
 * FolderView / ContentArea / SingleFileView (2200ms auto-dismiss).
 */
export function showToast(message: string, type: ToastType): void {
  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = message
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 2200)
}
