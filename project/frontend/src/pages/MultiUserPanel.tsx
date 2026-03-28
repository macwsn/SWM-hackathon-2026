import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { wsUrl } from '../lib/wsUrl'

const CAPTURE_INTERVAL_MS = 150

export default function MultiUserPanel({ userId }: { userId: string }) {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const processorWsRef = useRef<WebSocket | null>(null)
  const signalWsRef = useRef<WebSocket | null>(null)
  const waitingRef = useRef(false)

  const [isConnected, setIsConnected] = useState(false)
  const [callState, setCallState] = useState<'idle' | 'calling'>('idle')
  const [minDist, setMinDist] = useState<number | null>(null)

  // Start rear camera
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(stream => {
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(err => console.error('Camera access failed:', err))
  }, [])

  // Processor WebSocket
  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      ws = new WebSocket(wsUrl(`/ws/processor/${userId}`))
      processorWsRef.current = ws
      ws.onopen = () => setIsConnected(true)
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data)
          if (data.type === 'analysis') setMinDist(data.min_distance)
        } finally { waitingRef.current = false }
      }
      ws.onclose = () => { setIsConnected(false); waitingRef.current = false; reconnectTimer = setTimeout(connect, 2000) }
      ws.onerror = () => { waitingRef.current = false }
    }

    connect()
    return () => { if (reconnectTimer) clearTimeout(reconnectTimer); ws?.close() }
  }, [userId])

  // Signal WebSocket
  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      ws = new WebSocket(wsUrl(`/ws/multi_signal/${userId}`))
      signalWsRef.current = ws

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data)
          if (data.type === 'redirect' && data.to) {
            navigate(data.to)
          } else if (data.type === 'incoming_call') {
            // Auto-accept: immediately send accept and let backend redirect
            ws!.send(JSON.stringify({ type: 'accept_incoming_call', user_id: userId }))
          }
        } catch {}
      }

      ws.onclose = () => { reconnectTimer = setTimeout(connect, 2000) }
    }

    connect()
    return () => { if (reconnectTimer) clearTimeout(reconnectTimer); ws?.close() }
  }, [userId, navigate])

  // Frame capture loop
  useEffect(() => {
    const canvas = document.createElement('canvas')
    const interval = setInterval(() => {
      const vid = videoRef.current
      const ws = processorWsRef.current
      if (!vid || vid.readyState < 2 || !vid.videoWidth || !vid.videoHeight) return
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      if (waitingRef.current) return

      const maxDim = 480
      const ratio = Math.min(1.0, Math.min(maxDim / vid.videoWidth, maxDim / vid.videoHeight))
      const targetW = Math.round(vid.videoWidth * ratio)
      const targetH = Math.round(vid.videoHeight * ratio)
      if (canvas.width !== targetW || canvas.height !== targetH) { canvas.width = targetW; canvas.height = targetH }

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(vid, 0, 0, targetW, targetH)
      const b64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1]
      ws.send(JSON.stringify({ type: 'frame', data: b64, depth_mode: 'indoor' }))
      waitingRef.current = true
    }, CAPTURE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const handleCallRequest = () => {
    if (signalWsRef.current?.readyState === WebSocket.OPEN) {
      signalWsRef.current.send(JSON.stringify({ type: 'call_request', user_id: userId }))
      setCallState('calling')
    }
  }

  const distColor = minDist !== null
    ? minDist < 1.0 ? 'bg-brutal-red' : minDist < 2.0 ? 'bg-brutal-yellow' : 'bg-brutal-green'
    : 'bg-gray-800'

  const bgGlow = minDist !== null
    ? minDist < 1.0 ? 'glow-red' : minDist < 2.0 ? 'glow-yellow' : ''
    : ''

  return (
    <div className={`h-screen bg-brutal-dark bg-grid-light flex flex-col select-none overflow-hidden relative noise-overlay ${bgGlow}`}>

      {/* Status bar */}
      <div className={`flex items-center justify-between px-4 py-2 border-b-4 border-black flex-shrink-0 ${isConnected ? 'bg-brutal-green' : 'bg-brutal-red'}`}>
        <div className="flex items-center gap-2">
          <div className={`status-dot ${isConnected ? 'bg-black text-black' : 'bg-white text-white'}`} />
          <span className="font-black uppercase text-black text-sm">
            {userId.toUpperCase()} — {isConnected ? 'POŁĄCZONO' : 'BRAK POŁĄCZENIA'}
          </span>
        </div>
        {minDist !== null && (
          <span className={`tag-brutal ${distColor} text-black font-black`}>
            {minDist.toFixed(1)}m
          </span>
        )}
      </div>

      {/* Hidden video */}
      <video ref={videoRef} autoPlay muted playsInline
        style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }} />

      {/* Main area */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center relative z-10">
        {isConnected ? (
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <div className="w-24 h-24 bg-brutal-green/20 rounded-full animate-pulse-ring absolute inset-0" />
              <div className="w-24 h-24 bg-brutal-green/10 rounded-full animate-ping absolute inset-0" style={{ animationDelay: '0.5s' }} />
              <div className="w-24 h-24 bg-brutal-green rounded-full flex items-center justify-center relative border-4 border-black shadow-brutal">
                <span className="text-4xl">👁️</span>
              </div>
            </div>
            <span className="text-brutal-green font-black uppercase mt-6 text-lg tracking-wider">Kamera Aktywna</span>
            {minDist !== null && (
              <span className={`font-black text-2xl mt-1 ${minDist < 1.0 ? 'text-brutal-red' : minDist < 2.0 ? 'text-brutal-yellow' : 'text-brutal-green'}`}>
                {minDist.toFixed(1)}m
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 border-4 border-brutal-red rounded-full flex items-center justify-center">
              <span className="text-brutal-red text-4xl animate-blink">!</span>
            </div>
            <span className="text-brutal-red font-black uppercase animate-pulse text-lg">Łączenie...</span>
          </div>
        )}
      </div>

      {/* Call button */}
      <div className="flex-shrink-0 p-4 relative z-10">
        <button
          onClick={handleCallRequest}
          disabled={!isConnected || callState === 'calling'}
          className={`w-full h-24 btn-brutal text-lg font-black uppercase
            disabled:opacity-50 disabled:cursor-not-allowed
            flex flex-col items-center justify-center gap-1
            ${callState === 'calling' ? 'bg-brutal-yellow text-black' : 'bg-brutal-red text-white'}`}
        >
          <span className="text-2xl">{callState === 'calling' ? '📞' : '🆘'}</span>
          {callState === 'calling' ? 'DZWONI…' : 'POMOC'}
        </button>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 bg-black border-t-4 border-brutal-green px-4 py-2 flex items-center justify-between">
        <a href="/" className="text-brutal-green font-bold text-xs uppercase underline">← MENU</a>
        <span className="text-brutal-green/50 text-xs font-bold">BLIND ASSIST — {userId.toUpperCase()}</span>
      </div>
    </div>
  )
}
