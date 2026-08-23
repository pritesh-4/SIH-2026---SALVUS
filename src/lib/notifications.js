// Simple, lightweight pub-sub for calm application-level notification banners
const listeners = new Set()

/**
 * Trigger a calm global notification banner.
 *
 * @param {Object} options
 * @param {string} options.message - Human-friendly message (e.g. 'Live updates temporarily reconnecting.')
 * @param {'info' | 'warning' | 'error' | 'success'} [options.type='info']
 * @param {number} [options.duration=4000] - Duration in ms before auto-dismissing
 */
export const notify = ({ message, type = 'info', duration = 4000 }) => {
  const notification = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    message,
    type,
    duration,
  }
  listeners.forEach((listener) => listener(notification))
}

export const subscribeNotifications = (callback) => {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}
