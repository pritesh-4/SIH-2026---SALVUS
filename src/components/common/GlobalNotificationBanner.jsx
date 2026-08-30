import { useState, useEffect, useRef } from 'react'
import { subscribeNotifications } from '../../lib/notifications'

export const GlobalNotificationBanner = () => {
  const [activeNotification, setActiveNotification] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    const unsubscribe = subscribeNotifications((notification) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      setActiveNotification(notification)

      if (notification && notification.duration > 0) {
        timerRef.current = setTimeout(() => {
          setActiveNotification((cur) => (cur?.id === notification.id ? null : cur))
        }, notification.duration)
      }
    })

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      unsubscribe()
    }
  }, [])

  if (!activeNotification) return null

  const getStyle = (type) => {
    switch (type) {
      case 'error':
        return 'bg-salvus-critical-bg border-salvus-critical-border text-salvus-critical-text shadow-md'
      case 'warning':
        return 'bg-salvus-warning-bg border-salvus-warning-border text-salvus-warning-text shadow-md'
      case 'success':
        return 'bg-salvus-safe-bg border-salvus-safe-border text-salvus-safe-text shadow-md'
      default:
        return 'bg-salvus-info-bg border-salvus-info-border text-salvus-info-text shadow-md'
    }
  }

  const getIcon = (type) => {
    switch (type) {
      case 'error':
        return '🚨'
      case 'warning':
        return '⚠️'
      case 'success':
        return '✓'
      default:
        return 'ℹ️'
    }
  }

  return (
    <aside
      aria-label="System Notification"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[92%] animate-fadeIn pointer-events-none"
    >
      <div
        className={`px-4 py-2.5 rounded-xl border backdrop-blur-md flex items-center justify-between gap-3 text-xs sm:text-sm font-medium pointer-events-auto transition-all ${getStyle(
          activeNotification.type
        )}`}
      >
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true">{getIcon(activeNotification.type)}</span>
          <span className="leading-snug">{activeNotification.message}</span>
        </div>
        <button
          type="button"
          onClick={() => setActiveNotification(null)}
          aria-label="Dismiss notification"
          className="hover:opacity-75 text-xs p-1 cursor-pointer select-none"
        >
          ✕
        </button>
      </div>
    </aside>
  )
}
