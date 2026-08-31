import { io } from 'socket.io-client'
import { getAuthToken } from '../../services/api.js'

const SOCKET_URL =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_WS_URL) ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000')

let socketInstance = null
const connectionListeners = new Set()
const reconnectListeners = new Set()
const activeRooms = new Set()

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
 * Notify all registered reconnect handlers to rehydrate state.
 */
const notifyReconnect = () => {
  reconnectListeners.forEach((cb) => {
    try {
      cb()
    } catch (err) {
      console.error('[Socket.IO] Error in reconnect listener:', err)
    }
  })
}

/**
 * Get or initialize the singleton Socket.IO instance with authenticated handshake.
 */
export const getSocket = () => {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: typeof window !== 'undefined',
      auth: (cb) => {
        const token = getAuthToken() || ''
        cb({ token })
      },
      reconnection: typeof window !== 'undefined',
      reconnectionAttempts: 100,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 4000,
      timeout: 10000,
    })

    socketInstance.on('connect', () => {
      console.log('[Socket.IO] Connected to Salvus Realtime Hub:', socketInstance.id)
      // Automatically re-join all active rooms on reconnect
      activeRooms.forEach((room) => {
        socketInstance.emit('join_room', { room })
      })
      notifyStatus('CONNECTED')
      notifyReconnect()
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
      console.log('[Socket.IO] Reconnected cleanly')
      notifyStatus('CONNECTED')
      notifyReconnect()
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
 * Clean up all realtime resources on user logout.
 * Leaves all active rooms, disconnects socket, and resets the singleton instance.
 */
export const cleanupSocketOnLogout = () => {
  if (socketInstance) {
    try {
      activeRooms.forEach((room) => {
        socketInstance.emit('leave_room', { room })
      })
    } catch {
      // Socket may already be disconnected
    }
    activeRooms.clear()
    socketInstance.removeAllListeners()
    try {
      if (socketInstance.io) {
        socketInstance.io.close()
      }
      socketInstance.disconnect()
      socketInstance.close()
    } catch {
      // Ignore closing errors
    }
    socketInstance = null
  }
  notifyStatus('DISCONNECTED')
}

/**
 * Join a named room (e.g., 'authorities', 'incident:UUID').
 */
export const joinRoom = (room) => {
  if (!room) return
  activeRooms.add(room)
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
  if (!room) return
  activeRooms.delete(room)
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

/**
 * Register a listener to execute state rehydration whenever Socket.IO reconnects.
 *
 * @param {Function} callback - () => void
 * @returns {Function} Unsubscribe cleanup function
 */
export const onSocketReconnect = (callback) => {
  reconnectListeners.add(callback)
  return () => {
    reconnectListeners.delete(callback)
  }
}

/**
 * Get active socket telemetry for diagnostic panels.
 */
export const getSocketState = () => {
  return {
    connected: Boolean(socketInstance?.connected),
    id: socketInstance?.id || null,
    activeRooms: Array.from(activeRooms),
    url: SOCKET_URL,
  }
}

/**
 * Developer helper: simulate temporary connection drop for resilience testing.
 */
export const simulateConnectionDrop = (durationMs = 4000) => {
  if (!socketInstance) return
  console.log(`[Dev Demo] Simulating socket connection drop for ${durationMs}ms...`)
  socketInstance.disconnect()
  notifyStatus('RECONNECTING')

  setTimeout(() => {
    console.log('[Dev Demo] Restoring socket connection...')
    socketInstance.connect()
  }, durationMs)
}
