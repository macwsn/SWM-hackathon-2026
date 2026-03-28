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
  const [incomingCall, setIncomingCall] = useState(false)
  const [minDist, setMinDist] = useState<number | null>(null)

  // Start rear camera
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(stream => {
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(err => console.error('Camera access failed:', err))
  }, [])

  // Processor WebSocket — send frames to /ws/processor/{userId}
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
          if (data.type === 'analysis') {
            setMinDist(data.min_distance)
          }
        } finally {
          waitingRef.current = false
        }
      }
      ws.onclose = () => {
        setIsConnected(false)
        waitingRef.current = false
        reconnectTimer = setTimeout(connect, 2000)
      }
      ws.onerror = () => { waitingRef.current = false }
    }

    connect()
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [userId])

  // Signal WebSocket — listen for redirect from multi-assistant
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
            setIncomingCall(true)
          }
        } catch {}
      }

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 2000)
      }
    }

    connect()
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
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

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW
        canvas.height = targetH
      }

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

  const handleAcceptIncomingCall = () => {
    if (signalWsRef.current?.readyState === WebSocket.OPEN) {
      signalWsRef.current.send(JSON.stringify({ type: 'accept_incoming_call', user_id: userId }))
    }
    setIncomingCall(false)
  }

  const handleRejectIncomingCall = () => {
    setIncomingCall(false)
  }

  const distColor = minDist !== null
    ? minDist < 1.0 ? 'bg-brutal-red' : minDist < 2.0 ? 'bg-brutal-yellow' : 'bg-brutal-green'
    : 'bg-gray-800'

  return (
    <div className="h-screen bg-black flex flex-col select-none overflow-hidden">
      {/* Status bar */}
      <div className={`flex items-center justify-between px-4 py-2 border-b-4 border-black flex-shrink-0 ${isConnected ? 'bg-brutal-green' : 'bg-brutal-red'}`}>
        <span className="font-black uppercase text-black text-sm">
          {userId.toUpperCase()} — {isConnected ? 'POŁĄCZONO' : 'BRAK POŁĄCZENIA'}
        </span>
        {minDist !== null && (
          <span className={`tag-brutal ${distColor} text-black font-black`}>
            {minDist.toFixed(1)}m
          </span>
        )}
      </div>

      {/* Hidden video */}
      <video ref={videoRef} autoPlay muted playsInline
        style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        {isConnected ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 bg-brutal-green rounded-full animate-ping opacity-20 absolute" />
            <div className="w-16 h-16 bg-brutal-green rounded-full flex items-center justify-center relative border-4 border-black box-content">
              <span className="text-2xl">👁️</span>
            </div>
            <span className="text-brutal-green font-black uppercase mt-4">Kamera Aktywna</span>
          </div>
        ) : (
          <span className="text-brutal-red font-black uppercase animate-pulse">Łączenie...</span>
        )}
      </div>

      {/* Call button */}
      <div className="flex-shrink-0 p-4">
        <button
          onClick={handleCallRequest}
          disabled={!isConnected || callState === 'calling'}
          className={`w-full h-20 btn-brutal text-lg font-black uppercase
            disabled:opacity-50 disabled:cursor-not-allowed
            ${callState === 'calling' ? 'bg-brutal-yellow text-black' : 'bg-brutal-red text-white'}`}
        >
          {callState === 'calling' ? '📞 DZWONI…' : '🆘 POMOC'}
        </button>
      </div>

      <div className="flex-shrink-0 bg-brutal-yellow border-t-4 border-black px-4 py-1 text-center">
        <a href="/" className="text-black font-bold text-xs uppercase underline">← MENU</a>
      </div>
    </div>
  )
}
