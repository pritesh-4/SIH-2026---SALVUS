/**
 * Salvus Emergency Audio Utility
 *
 * Provides a lightweight local audio test tone using the standard Web Audio API.
 * Synthesizes a gentle dual-frequency pulsed alert tone (880Hz / 440Hz)
 * without requiring external sound files or internet connectivity.
 *
 * Strictly for user-initiated device readiness tests.
 * Never triggers SOS or external emergency broadcasts.
 */

let activeAudioContext = null

/**
 * Play a short 1.5-second local emergency test siren tone.
 *
 * @param {Object} options
 * @param {Function} options.onStart - Callback when audio tone starts playing
 * @param {Function} options.onEnd - Callback when audio tone completes or stops
 * @param {Function} options.onError - Callback if audio context is blocked or unavailable
 * @returns {Function} stopTone - Function to stop the tone immediately
 */
export const playTestEmergencySiren = ({ onStart, onEnd, onError } = {}) => {
  if (typeof window === 'undefined') {
    onError?.(new Error('Audio is not supported in non-browser environment.'))
    return () => {}
  }

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) {
      throw new Error('Web Audio API is not supported in this browser.')
    }

    if (activeAudioContext && activeAudioContext.state !== 'closed') {
      try {
        activeAudioContext.close()
      } catch {
        // Ignore close error on existing context
      }
    }

    const ctx = new AudioCtx()
    activeAudioContext = ctx

    // Master volume gain (gentle test volume)
    const masterGain = ctx.createGain()
    masterGain.gain.setValueAtTime(0.12, ctx.currentTime)
    masterGain.connect(ctx.destination)

    const osc = ctx.createOscillator()
    osc.type = 'sine'

    const now = ctx.currentTime
    // Pulse 1: 880 Hz
    osc.frequency.setValueAtTime(880, now)
    // Pulse 2: 440 Hz
    osc.frequency.setValueAtTime(440, now + 0.35)
    // Pulse 3: 880 Hz
    osc.frequency.setValueAtTime(880, now + 0.7)
    // Pulse 4: 440 Hz
    osc.frequency.setValueAtTime(440, now + 1.05)

    // Smooth envelope ramp down at 1.4s
    masterGain.gain.setValueAtTime(0.12, now + 1.35)
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5)

    osc.connect(masterGain)
    osc.start(now)
    osc.stop(now + 1.5)

    onStart?.()

    const timeoutId = setTimeout(() => {
      onEnd?.()
      try {
        if (ctx.state !== 'closed') {
          ctx.close()
        }
      } catch {
        // Ignore
      }
    }, 1500)

    return () => {
      clearTimeout(timeoutId)
      try {
        osc.stop()
        if (ctx.state !== 'closed') {
          ctx.close()
        }
      } catch {
        // Ignore
      }
      onEnd?.()
    }
  } catch (err) {
    onError?.(err)
    return () => {}
  }
}
