import { useEffect, useRef, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useWebRTC } from '../hooks/useWebRTC'
import { useSpatialPing } from '../hooks/useSpatialPing'
import { useLocation } from '../hooks/useLocation'
import { wsUrl } from '../lib/wsUrl'
import type { DepthFrame, ObstaclePing } from '../types'

const CAPTURE_INTERVAL_MS = 150

type AlertOverlay = { text: string; id: number }

export default function UserPanel() {
  const { lastMessage, status, send } = useWebSocket(wsUrl('/ws/user'))
  const { callState, requestCall, answerCall, hangUp } = useWebRTC('user')
  const { isEnabled: pingEnabled, init: initPing, toggle: togglePing, playObstaclePing } = useSpatialPing()
  useLocation(send)

  const [overlay, setOverlay] = useState<AlertOverlay | null>(null)
  const [isDescribing, setIsDescribing] = useState(false)
  const [depthFrame, setDepthFrame] = useState<DepthFrame | null>(null)
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Video ref for frame capture
  const videoRef = useRef<HTMLVideoElement>(null)
  const processorWsRef = useRef<WebSocket | null>(null)
  const waitingRef = useRef(false)

  // Start local camera
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      })
      .catch(err => console.error('Camera access failed:', err))
  }, [])

  // Play TTS audio and show overlay when alert arrives
  useEffect(() => {
    if (!lastMessage) return
    const msg = lastMessage as { type: string; data?: string; text?: string; distance?: number; direction?: 'left' | 'center' | 'right'; severity?: 'INFO' | 'WARNING' | 'CRITICAL' }

    if (msg.type === 'obstacle_ping' && msg.direction && msg.severity) {
      const payload: ObstaclePing = {
        type: 'obstacle_ping',
        direction: msg.direction,
        severity: msg.severity,
        distance: msg.distance ?? 4.0,
        timestamp: Date.now() / 1000,
      }
      void playObstaclePing(payload)

      if (overlayTimer.current) clearTimeout(overlayTimer.current)
      const dirLabel = payload.direction === 'left' ? 'PO LEWEJ' : payload.direction === 'right' ? 'PO PRAWEJ' : 'NA WPROST'
      const sevLabel = payload.severity === 'CRITICAL' ? 'PILNE' : 'UWAGA'
      setOverlay({ text: `${sevLabel}: ${dirLabel} ${payload.distance.toFixed(1)} m`, id: Date.now() })
      overlayTimer.current = setTimeout(() => setOverlay(null), 2500)
      return
    }

    if (msg.type === 'tts_audio' && msg.data) {
      playAudio(msg.data)
      if (msg.text) {
        if (overlayTimer.current) clearTimeout(overlayTimer.current)
        setOverlay({ text: msg.text, id: Date.now() })
        overlayTimer.current = setTimeout(() => setOverlay(null), 5000)
      }
      setIsDescribing(false)
    }
  }, [lastMessage])

  // Processor WebSocket — send frames, receive depth results
  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      ws = new WebSocket(wsUrl('/ws/processor'))
      processorWsRef.current = ws

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data)
          if (data.type === 'analysis') {
            setDepthFrame({
              data: data.depth_frame,
              min_distance: data.min_distance,
              inference_ms: data.inference_ms,
              is_indoor: data.is_indoor,
            })
          }
        } finally {
          waitingRef.current = false
        }
      }

      ws.onclose = () => {
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
  }, [])

  // Frame capture loop — captures from <video>, sends to processor WS
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

  const handleDescribe = () => {
    void initPing()
    setIsDescribing(true)
    send({ type: 'describe_request' })
  }

  const handleCallToggle = () => {
    void initPing()
    if (callState === 'incoming') {
      answerCall()
    } else if (callState === 'in-call' || callState === 'calling') {
      hangUp()
    } else {
      requestCall()
    }
  }

  const handleTogglePing = () => {
    void initPing()
    togglePing()
  }

  const isConnected = status === 'open'

  const distColor = depthFrame
    ? depthFrame.min_distance < 1.0
      ? 'text-brutal-red'
      : depthFrame.min_distance < 2.0
      ? 'text-brutal-yellow'
      : 'text-brutal-green'
    : 'text-white'

  return (
    <div className="h-screen bg-black flex flex-col select-none overflow-hidden">
      {/* Status bar */}
      <div className={`flex items-center justify-between px-4 py-2 border-b-4 border-black flex-shrink-0 ${isConnected ? 'bg-brutal-green' : 'bg-brutal-red'}`}>
        <span className="font-black uppercase text-black text-sm">
          {isConnected ? 'POŁĄCZONO' : 'BRAK POŁĄCZENIA'}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTogglePing}
            className={`tag-brutal ${pingEnabled ? 'bg-brutal-yellow text-black' : 'bg-gray-200 text-black'}`}
          >
            {pingEnabled ? 'PING ON' : 'PING OFF'}
          </button>
          <CallIndicator callState={callState} />
        </div>
      </div>

      {/* Hidden Video for frame capture */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}
      />

      {/* Main Area (Empty for blind user) */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        {!isConnected && (
           <span className="text-brutal-red font-black uppercase animate-pulse">Brak połączenia z systemem</span>
        )}
        {isConnected && !depthFrame && (
           <span className="text-brutal-yellow font-black uppercase animate-pulse">Inicjalizacja systemu wizyjnego…</span>
        )}
        {isConnected && depthFrame && (
           <div className="flex flex-col items-center gap-2">
             <div className="w-16 h-16 bg-brutal-green rounded-full animate-ping opacity-20 absolute" />
             <div className="w-16 h-16 bg-brutal-green rounded-full flex items-center justify-center relative border-4 border-black box-content">
                <span className="text-2xl">👁️</span>
             </div>
             <span className="text-brutal-green font-black uppercase mt-4">System Aktywny</span>
           </div>
        )}
      </div>

      {/* Alert overlay */}
      {overlay && (
        <div className="flex-shrink-0 mx-4 my-2 border-4 border-brutal-red bg-brutal-red text-white p-3 shadow-brutal">
          <p className="font-black text-lg uppercase leading-tight">{overlay.text}</p>
        </div>
      )}

      {/* Incoming call banner */}
      {callState === 'incoming' && (
        <div className="flex-shrink-0 bg-brutal-yellow border-y-4 border-black p-4 flex flex-col gap-3 animate-pulse">
          <p className="font-black uppercase text-black text-2xl text-center">📞 OPIEKUN DZWONI!</p>
          <div className="flex gap-3">
            <button onClick={() => handleCallToggle()} className="flex-1 btn-brutal bg-brutal-green text-black font-black text-xl py-4 uppercase">ODBIERZ</button>
            <button onClick={hangUp} className="flex-1 btn-brutal bg-brutal-red text-white font-black text-xl py-4 uppercase">ODRZUĆ</button>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex-shrink-0 flex gap-3 p-4">
        <button
          onClick={handleDescribe}
          disabled={!isConnected || isDescribing}
          className="flex-1 h-20 btn-brutal bg-brutal-yellow text-black text-lg font-black uppercase
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-x-0 disabled:translate-y-0 disabled:shadow-brutal"
        >
          {isDescribing ? '⏳ OPISUJĘ…' : '🔍 OPISZ'}
        </button>

        <button
          onClick={handleCallToggle}
          disabled={!isConnected}
          className={`flex-1 h-20 btn-brutal text-lg font-black uppercase
            disabled:opacity-50 disabled:cursor-not-allowed
            ${callState === 'in-call' || callState === 'calling' || callState === 'incoming'
              ? 'bg-brutal-green text-black'
              : 'bg-brutal-red text-white'
            }`}
        >
          {callState === 'in-call' ? '📞 ROZŁĄCZ' : callState === 'calling' ? '📞 DZWONI…' : callState === 'incoming' ? '📞 ODBIERZ' : '🆘 POMOC'}
        </button>
      </div>

      {/* Footer nav */}
      <div className="flex-shrink-0 bg-brutal-yellow border-t-4 border-black px-4 py-1 text-center">
        <a href="/" className="text-black font-bold text-xs uppercase underline">← MENU</a>
      </div>
    </div>
  )
}

function CallIndicator({ callState }: { callState: string }) {
  if (callState === 'idle') return null
  const labels: Record<string, string> = {
    calling: 'DZWONIENIE…',
    incoming: 'POŁĄCZENIE!',
    'in-call': '● W ROZMOWIE',
  }
  return (
    <span className="bg-black text-brutal-green px-2 py-0.5 text-xs font-black border-2 border-brutal-green animate-pulse">
      {labels[callState] ?? callState}
    </span>
  )
}

function playAudio(base64mp3: string) {
  try {
    const bytes = atob(base64mp3)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
    const blob = new Blob([arr], { type: 'audio/mp3' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.play().catch(console.error)
    audio.onended = () => URL.revokeObjectURL(url)
  } catch (e) {
    console.error('Audio play failed', e)
  }
}
