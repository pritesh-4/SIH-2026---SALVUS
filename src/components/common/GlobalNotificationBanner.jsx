import { useState, useEffect } from 'react'
import { subscribeNotifications } from '../../lib/notifications'

export const GlobalNotificationBanner = () => {
  const [activeNotification, setActiveNotification] = useState(null)

  useEffect(() => {
    const unsubscribe = subscribeNotifications((notification) => {
      setActiveNotification(notification)

      if (notification.duration > 0) {
        const timer = setTimeout(() => {
          setActiveNotification((cur) => (cur?.id === notification.id ? null : cur))
        }, notification.duration)
        return () => clearTimeout(timer)
      }
    })

    return unsubscribe
  }, [])

  if (!activeNotification) return null

  const getStyle = (type) => {
    switch (type) {
      case 'error':
        return 'bg-rose-950/90 border-rose-500/50 text-rose-200 shadow-rose-950/50'
      case 'warning':
        return 'bg-amber-950/90 border-amber-500/50 text-amber-200 shadow-amber-950/50'
      case 'success':
        return 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200 shadow-emerald-950/50'
      default:
        return 'bg-[#0D1520]/95 border-cyan-500/40 text-cyan-200 shadow-cyan-950/50'
    }
  }

  const getIcon = (type) => {
    switch (type) {
      case 'error':
        return '⚠️'
      case 'warning':
        return '⚡'
      case 'success':
        return '✓'
      default:
        return 'ℹ️'
    }
  }

  return (
    <aside
      aria-label="System Notification"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-50 max-w-md w-[92%] animate-fadeIn pointer-events-none"
    >
      <div
        className={`px-4 py-2.5 rounded-xl border backdrop-blur-md shadow-2xl flex items-center justify-between gap-3 text-xs font-mono font-medium pointer-events-auto ${getStyle(
          activeNotification.type
        )}`}
      >
        <div className="flex items-center gap-2">
          <span>{getIcon(activeNotification.type)}</span>
          <span>{activeNotification.message}</span>
        </div>
        <button
          type="button"
          onClick={() => setActiveNotification(null)}
          className="text-slate-400 hover:text-white text-sm p-0.5 cursor-pointer"
        >
          ✕
        </button>
      </div>
    </aside>
  )
}
