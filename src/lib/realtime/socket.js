import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_WS_URL || window.location.origin

let socketInstance = null
const connectionListeners = new Set()

/**
 * Notify all registered connection status listeners.
 */
const notifyStatus = (status) => {
  connectionListeners.forEach((cb) => {
    try {
      cb(status)
    } catch (err) {
      console.error('[Socket.IO] Error in connection listener:', err)
    }
  })
}

/**
 * Get or initialize the singleton Socket.IO instance.
 */
export const getSocket = () => {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 50,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    })

    socketInstance.on('connect', () => {
      console.log('[Socket.IO] Connected to Salvus Realtime Hub:', socketInstance.id)
      notifyStatus('CONNECTED')
    })

    socketInstance.on('disconnect', (reason) => {
      console.log('[Socket.IO] Disconnected:', reason)
      notifyStatus(reason === 'io client disconnect' ? 'DISCONNECTED' : 'OFFLINE')
    })

    socketInstance.on('connect_error', (error) => {
      console.warn('[Socket.IO] Connection error:', error.message)
      notifyStatus('RECONNECTING')
    })

    socketInstance.on('reconnect_attempt', () => {
      notifyStatus('RECONNECTING')
    })

    socketInstance.on('reconnect', () => {
      console.log('[Socket.IO] Reconnected')
      notifyStatus('CONNECTED')
    })
  }

  return socketInstance
}

/**
 * Connect the socket instance if disconnected.
 */
export const connectSocket = () => {
  const socket = getSocket()
  if (!socket.connected) {
    socket.connect()
  }
  return socket
}

/**
 * Disconnect socket.
 */
export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect()
  }
}

/**
 * Join a named room (e.g., 'authorities', 'incident:UUID').
 */
export const joinRoom = (room) => {
  const socket = getSocket()
  if (socket.connected) {
    socket.emit('join_room', { room })
  } else {
    socket.once('connect', () => {
      socket.emit('join_room', { room })
    })
  }
}

/**
 * Leave a named room.
 */
export const leaveRoom = (room) => {
  const socket = getSocket()
  if (socket.connected) {
    socket.emit('leave_room', { room })
  }
}

/**
 * Subscribe to a socket event with automatic cleanup.
 *
 * @param {string} event - Event name (e.g. 'incident:new', 'incident:status_changed')
 * @param {Function} handler - Event callback function
 * @returns {Function} Unsubscribe cleanup function
 */
export const subscribeToEvent = (event, handler) => {
  const socket = getSocket()
  socket.on(event, handler)
  return () => {
    socket.off(event, handler)
  }
}

/**
 * Listen for connection health status changes.
 *
 * @param {Function} callback - callback(status: 'CONNECTED' | 'RECONNECTING' | 'OFFLINE' | 'DISCONNECTED')
 * @returns {Function} Unsubscribe cleanup function
 */
export const onSocketStatusChange = (callback) => {
  connectionListeners.add(callback)
  if (socketInstance) {
    callback(socketInstance.connected ? 'CONNECTED' : 'OFFLINE')
  }
  return () => {
    connectionListeners.delete(callback)
  }
}
