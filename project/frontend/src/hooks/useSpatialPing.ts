import { useCallback, useRef, useState } from 'react'

const CRITICAL_DISTANCE_M = 1.2

type Direction = 'left' | 'center' | 'right'
type Severity = 'INFO' | 'WARNING' | 'CRITICAL'

export interface ObstaclePingPayload {
  direction: Direction
  severity: Severity
  distance?: number
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function useSpatialPing() {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const lastPingRef = useRef<{ key: string; ts: number }>({ key: '', ts: 0 })
  const [isEnabled, setIsEnabled] = useState(true)

  const init = useCallback(async () => {
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume()
      }
      return
    }

    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return

    const ctx = new AudioContextClass()
    const master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)

    if (ctx.listener) {
      const listener = ctx.listener
      if (typeof listener.forwardZ !== 'undefined') {
        listener.positionX.value = 0
        listener.positionY.value = 0
        listener.positionZ.value = 0
        listener.forwardX.value = 0
        listener.forwardY.value = 0
        listener.forwardZ.value = -1
        listener.upX.value = 0
        listener.upY.value = 1
        listener.upZ.value = 0
      } else if (typeof listener.setPosition === 'function' && typeof listener.setOrientation === 'function') {
        listener.setPosition(0, 0, 0)
        listener.setOrientation(0, 0, -1, 0, 1, 0)
      }
    }

    audioCtxRef.current = ctx
    masterGainRef.current = master
  }, [])

  const stop = useCallback(() => {
    lastPingRef.current = { key: '', ts: 0 }
  }, [])

  const toggle = useCallback(() => {
    setIsEnabled((prev) => !prev)
  }, [])

  const playObstaclePing = useCallback(
    async (obstacle: ObstaclePingPayload) => {
      if (!isEnabled || !obstacle || obstacle.severity === 'INFO') return

      await init()
      const ctx = audioCtxRef.current
      const master = masterGainRef.current
      if (!ctx || !master) return

      const now = performance.now()
      const distanceM = typeof obstacle.distance === 'number' ? obstacle.distance : 4.0
      const nearFactor = clamp(1 - distanceM / 3.5, 0, 1)
      const cooldownMs = obstacle.severity === 'CRITICAL'
        ? 24 + (1 - nearFactor) * 24
        : 34 + (1 - nearFactor) * 30
      const key = `${obstacle.direction}_${obstacle.severity}`
      if (lastPingRef.current.key === key && now - lastPingRef.current.ts < cooldownMs) {
        return
      }
      lastPingRef.current = { key, ts: now }

      const closeFactor = clamp(Math.pow(nearFactor, 0.55), 0.05, 1.0)

      let x = 0
      if (obstacle.direction === 'left') x = -1
      if (obstacle.direction === 'right') x = 1

      let z = -0.7
      if (obstacle.severity === 'CRITICAL' && distanceM <= CRITICAL_DISTANCE_M) {
        z = 1.0
      }

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const panner = ctx.createPanner()

      panner.panningModel = 'HRTF'
      panner.distanceModel = 'inverse'
      panner.refDistance = 0.6
      panner.maxDistance = 20
      panner.rolloffFactor = 1.3
      panner.positionX.value = x
      panner.positionY.value = 0
      panner.positionZ.value = z

      const baseFreq = obstacle.severity === 'CRITICAL' ? 1240 : 900
      const pingDuration = obstacle.severity === 'CRITICAL' ? 0.07 : 0.06
      const minGain = obstacle.severity === 'CRITICAL' ? 0.22 : 0.12
      const maxCeiling = obstacle.severity === 'CRITICAL' ? 1.25 : 0.85
      const maxGain = minGain + (maxCeiling - minGain) * closeFactor

      const t0 = ctx.currentTime
      osc.type = 'sine'
      osc.frequency.setValueAtTime(baseFreq, t0)
      osc.frequency.linearRampToValueAtTime(baseFreq * 0.84, t0 + pingDuration)

      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, maxGain), t0 + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + pingDuration)

      osc.connect(gain)
      gain.connect(panner)
      panner.connect(master)

      osc.start(t0)
      osc.stop(t0 + pingDuration + 0.01)
    },
    [init, isEnabled],
  )

  return {
    isEnabled,
    init,
    stop,
    toggle,
    playObstaclePing,
  }
}
