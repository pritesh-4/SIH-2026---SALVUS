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
        return 'bg-[#181114] border-rose-500/40 text-rose-200 shadow-xl'
      case 'warning':
        return 'bg-[#18150E] border-amber-500/40 text-amber-200 shadow-xl'
      case 'success':
        return 'bg-[#0E1814] border-emerald-500/40 text-emerald-200 shadow-xl'
      default:
        return 'bg-[#0E1520] border-blue-500/40 text-slate-200 shadow-xl'
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
        className={`px-3.5 py-2 rounded-lg border backdrop-blur-md flex items-center justify-between gap-3 text-xs font-mono font-medium pointer-events-auto ${getStyle(
          activeNotification.type
        )}`}
      >
        <div className="flex items-center gap-2">
          <span>{getIcon(activeNotification.type)}</span>
          <span className="text-slate-200">{activeNotification.message}</span>
        </div>
        <button
          type="button"
          onClick={() => setActiveNotification(null)}
          className="text-slate-400 hover:text-white text-xs p-0.5 cursor-pointer"
        >
          ✕
        </button>
      </div>
    </aside>
  )
}
