import { useEffect, useRef, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useWebRTC } from '../hooks/useWebRTC'
import { useAIAudioCall } from '../hooks/useAIAudioCall'
import { useSpatialPing } from '../hooks/useSpatialPing'
import { useLocation } from '../hooks/useLocation'
import { wsUrl } from '../lib/wsUrl'
import type { DepthFrame, ObstaclePing } from '../types'

const CAPTURE_INTERVAL_MS = 150

type AlertOverlay = { text: string; id: number }

export default function UserPanel() {
  const { lastMessage, status, send, ws: wsRef } = useWebSocket(wsUrl('/ws/user'))
  const { callState, requestCall, answerCall, hangUp } = useWebRTC('user')
  const { aiCallState, startAICall, endAICall, playAudioChunk, clearAudioQueue } = useAIAudioCall(wsRef)
  const { isEnabled: pingEnabled, init: initPing, toggle: togglePing, playObstaclePing } = useSpatialPing()
  useLocation(send)

  const [overlay, setOverlay] = useState<AlertOverlay | null>(null)
  const [isDescribing, setIsDescribing] = useState(false)
  const [depthFrame, setDepthFrame] = useState<DepthFrame | null>(null)
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const processorWsRef = useRef<WebSocket | null>(null)
  const waitingRef = useRef(false)

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(stream => {
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(err => console.error('Camera access failed:', err))
  }, [])

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

      // Haptic vibration feedback for mobile — stronger for closer obstacles
      if (navigator.vibrate) {
        const pattern = payload.severity === 'CRITICAL'
          ? [100, 50, 100, 50, 200]  // urgent triple buzz
          : [80, 60, 80]              // warning double buzz
        navigator.vibrate(pattern)
      }

      if (overlayTimer.current) clearTimeout(overlayTimer.current)
      const dirLabel = payload.direction === 'left' ? 'LEFT' : payload.direction === 'right' ? 'RIGHT' : 'AHEAD'
      const sevLabel = payload.severity === 'CRITICAL' ? 'URGENT' : 'WARNING'
      setOverlay({ text: `${sevLabel}: ${dirLabel} ${payload.distance.toFixed(1)} m`, id: Date.now() })
      overlayTimer.current = setTimeout(() => setOverlay(null), 2500)
      return
    }

    if (msg.type === 'tts_audio') {
      // Try to play audio if available, otherwise fallback to Web Speech API
      if (msg.data && msg.data.length > 0) {
        playAudio(msg.data, msg.text)
      } else if (msg.text) {
        // Fallback to browser TTS when backend TTS fails
        speakText(msg.text)
      }

      if (msg.text) {
        if (overlayTimer.current) clearTimeout(overlayTimer.current)
        setOverlay({ text: msg.text, id: Date.now() })
        overlayTimer.current = setTimeout(() => setOverlay(null), 5000)
      }
      setIsDescribing(false)
    }

    // Handle AI audio call messages
    if (msg.type === 'ai_call_started') {
      console.log('[UserPanel] AI call started')
    }

    if (msg.type === 'ai_call_rejected') {
      console.log('[UserPanel] AI call rejected - caregiver available, using WebRTC instead')
      // AI call was rejected because caregiver is available
      // The useAIAudioCall hook will handle cleanup automatically
      // Now initiate WebRTC call to caregiver
      requestCall()
    }

    if (msg.type === 'ai_audio_chunk') {
      // Play audio chunk from Gemini
      if (msg.data) {
        void playAudioChunk(msg.data as string)
      }
    }

    // Handle AI interruption - user started speaking while AI was responding
    if (msg.type === 'ai_interrupted') {
      console.log('[UserPanel] AI interrupted - clearing audio queue')
      clearAudioQueue()
    }

    if (msg.type === 'ai_call_ended') {
      console.log('[UserPanel] AI call ended')
    }

    if (msg.type === 'ai_call_error') {
      console.error('[UserPanel] AI call error:', msg)
      setOverlay({ text: 'BŁĄD POŁĄCZENIA AI', id: Date.now() })
      overlayTimer.current = setTimeout(() => setOverlay(null), 3000)
    }
  }, [lastMessage])

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
        } finally { waitingRef.current = false }
      }
      ws.onclose = () => { waitingRef.current = false; reconnectTimer = setTimeout(connect, 2000) }
      ws.onerror = () => { waitingRef.current = false }
    }

    connect()
    return () => { if (reconnectTimer) clearTimeout(reconnectTimer); ws?.close() }
  }, [])

  useEffect(() => {
    const canvas = document.createElement('canvas')
    let frameCount = 0
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
      // Send frame without depth_mode so backend can use AUTO_DEPTH_MODE_WITH_GEMINI
      // Backend will auto-detect indoor/outdoor if enabled in config
      ws.send(JSON.stringify({ type: 'frame', data: b64, depth_mode: 'outdoor' }))

      // Also send frame to main user WebSocket if AI call is active
      if (aiCallState === 'active' && wsRef.current?.readyState === WebSocket.OPEN) {
        frameCount++
        if (frameCount % 10 === 1) {  // Log every 10th frame to reduce noise
          console.log('[UserPanel] 📹 Sending frame #' + frameCount + ' to AI (size:', b64.length, 'bytes)')
        }
        wsRef.current.send(JSON.stringify({ type: 'frame', data: b64 }))
      } else if (aiCallState === 'active') {
        console.log('[UserPanel] ⚠️ AI call active but WebSocket not ready. State:', wsRef.current?.readyState, ', OPEN=', WebSocket.OPEN)
      } else if (frameCount > 0) {
        console.log('[UserPanel] ℹ️ AI call ended, sent', frameCount, 'frames total')
        frameCount = 0
      }

      waitingRef.current = true
    }, CAPTURE_INTERVAL_MS)
    return () => {
      clearInterval(interval)
      if (frameCount > 0) {
        console.log('[UserPanel] 🛑 Interval cleared, sent', frameCount, 'frames total')
      }
    }
  }, [aiCallState, wsRef])

  const handleDescribe = () => {
    void initPing()
    setIsDescribing(true)
    send({ type: 'describe_request' })
  }

  const handleCallToggle = () => {
    void initPing()

    // If AI call is active or starting, end it
    if (aiCallState === 'active' || aiCallState === 'starting') {
      console.log('[UserPanel] Ending AI call...')
      endAICall()
      return
    }

    // If WebRTC call is incoming, answer it
    if (callState === 'incoming') {
      answerCall()
      return
    }

    // If WebRTC call is active or calling, hang up
    if (callState === 'in-call' || callState === 'calling') {
      hangUp()
      return
    }

    // Otherwise, try to start AI call first
    // The backend will reject if caregiver is available, and we'll fall back to WebRTC
    console.log('[UserPanel] Requesting help...')
    void startAICall()
  }

  const handleTogglePing = () => {
    void initPing()
    togglePing()
  }

  const isConnected = status === 'open'

  const distColor = depthFrame
    ? depthFrame.min_distance < 1.0 ? 'text-brutal-red' : depthFrame.min_distance < 2.0 ? 'text-brutal-yellow' : 'text-brutal-green'
    : 'text-white'

  const bgGlow = depthFrame
    ? depthFrame.min_distance < 1.0 ? 'glow-red' : depthFrame.min_distance < 2.0 ? 'glow-yellow' : ''
    : ''

  return (
    <div className={`h-screen bg-brutal-dark bg-grid-light flex flex-col select-none overflow-hidden relative noise-overlay ${bgGlow}`}>

      {/* Status bar */}
      <div className={`flex items-center justify-between px-4 py-2 border-b-4 border-black flex-shrink-0 ${isConnected ? 'bg-brutal-green' : 'bg-brutal-red'}`}>
        <div className="flex items-center gap-2">
          <div className={`status-dot ${isConnected ? 'bg-black text-black' : 'bg-white text-white'}`} />
          <span className="font-black uppercase text-black text-sm">
            {isConnected ? 'CONNECTED' : 'NO CONNECTION'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTogglePing}
            className={`tag-brutal ${pingEnabled ? 'bg-brutal-yellow text-black' : 'bg-gray-200 text-black'}`}
          >
            {pingEnabled ? ')) PING ON' : 'PING OFF'}
          </button>
          <CallIndicator callState={callState} />
          {depthFrame && (
            <span className={`tag-brutal bg-black ${distColor} font-black`}>
              {depthFrame.min_distance.toFixed(1)}m
            </span>
          )}
        </div>
      </div>

      {/* Hidden Video */}
      <video ref={videoRef} autoPlay muted playsInline
        style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }} />

      {/* Main Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center relative z-10">
        {!isConnected && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 border-4 border-brutal-red rounded-full flex items-center justify-center">
              <span className="text-brutal-red text-4xl animate-blink">!</span>
            </div>
            <span className="text-brutal-red font-black uppercase animate-pulse text-lg">No connection to system</span>
          </div>
        )}
        {isConnected && !depthFrame && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 border-4 border-brutal-yellow border-dashed rounded-full flex items-center justify-center animate-spin-slow">
              <span className="text-brutal-yellow text-2xl animate-none">⟳</span>
            </div>
            <span className="text-brutal-yellow font-black uppercase animate-pulse">Initializing vision system…</span>
          </div>
        )}
        {isConnected && depthFrame && (
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <div className="w-24 h-24 bg-brutal-green/20 rounded-full animate-pulse-ring absolute inset-0" />
              <div className="w-24 h-24 bg-brutal-green/10 rounded-full animate-ping absolute inset-0" style={{ animationDelay: '0.5s' }} />
              <div className="w-24 h-24 bg-brutal-green rounded-full flex items-center justify-center relative border-4 border-black shadow-brutal">
                <span className="text-4xl">👁️</span>
              </div>
            </div>
            <span className="text-brutal-green font-black uppercase mt-6 text-lg tracking-wider">System Active</span>
            <span className={`font-black text-2xl mt-1 ${distColor}`}>
              {depthFrame.min_distance.toFixed(1)}m
            </span>
          </div>
        )}
      </div>

      {/* Alert overlay */}
      {overlay && (
        <div className="flex-shrink-0 mx-4 my-2 border-4 border-brutal-red bg-brutal-red text-white p-4 shadow-brutal animate-slide-up">
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-pulse">⚠️</span>
            <p className="font-black text-lg uppercase leading-tight flex-1">{overlay.text}</p>
          </div>
        </div>
      )}

      {/* Incoming call banner */}
      {callState === 'incoming' && (
        <div className="flex-shrink-0 bg-brutal-yellow border-y-4 border-black p-4 flex flex-col gap-3 animate-pulse">
          <p className="font-black uppercase text-black text-2xl text-center">📞 CAREGIVER CALLING!</p>
          <div className="flex gap-3">
            <button onClick={() => handleCallToggle()} className="flex-1 btn-brutal bg-brutal-green text-black font-black text-xl py-4 uppercase">ANSWER</button>
            <button onClick={hangUp} className="flex-1 btn-brutal bg-brutal-red text-white font-black text-xl py-4 uppercase">REJECT</button>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex-shrink-0 flex gap-3 p-4 relative z-10">
        <button
          onClick={handleDescribe}
          disabled={!isConnected || isDescribing}
          className="flex-1 h-24 btn-brutal bg-brutal-yellow text-black text-lg font-black uppercase
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-x-0 disabled:translate-y-0 disabled:shadow-brutal
                     flex flex-col items-center justify-center gap-1"
        >
          <span className="text-2xl">{isDescribing ? '⏳' : '🔍'}</span>
          {isDescribing ? 'DESCRIBING…' : 'DESCRIBE'}
        </button>

        <button
          onClick={handleCallToggle}
          disabled={!isConnected}
          className={`flex-1 h-24 btn-brutal text-lg font-black uppercase
            disabled:opacity-50 disabled:cursor-not-allowed
            ${callState === 'in-call' || callState === 'calling' || callState === 'incoming'
              ? 'bg-brutal-green text-black'
              : aiCallState === 'active'
              ? 'bg-brutal-blue text-white'
              : aiCallState === 'starting'
              ? 'bg-brutal-yellow text-black'
              : 'bg-brutal-red text-white'
            }`}
        >
          {callState === 'in-call'
            ? '📞 HANG UP'
            : callState === 'calling'
            ? '📞 CALLING…'
            : callState === 'incoming'
            ? '📞 ANSWER'
            : aiCallState === 'active'
            ? '🤖 DISCONNECT AI'
            : aiCallState === 'starting'
            ? '🤖 CONNECTING AI…'
            : '🆘 HELP'}
        </button>
      </div>

      {/* Footer nav */}
      <div className="flex-shrink-0 bg-black border-t-4 border-brutal-green px-4 py-2 flex items-center justify-between">
        <a href="/" className="text-brutal-green font-bold text-xs uppercase underline">← MENU</a>
        <span className="text-brutal-green/50 text-xs font-bold">AISIGHT v1.0</span>
      </div>
    </div>
  )
}

function CallIndicator({ callState }: { callState: string }) {
  if (callState === 'idle') return null
  const labels: Record<string, string> = {
    calling: 'CALLING…',
    incoming: 'INCOMING CALL!',
    'in-call': '● IN CALL',
  }
  return (
    <span className="bg-black text-brutal-green px-2 py-0.5 text-xs font-black border-2 border-brutal-green animate-pulse">
      {labels[callState] ?? callState}
    </span>
  )
}

function playAudio(base64mp3: string, fallbackText?: string) {
  try {
    const bytes = atob(base64mp3)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
    const blob = new Blob([arr], { type: 'audio/mp3' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.play().catch((err) => {
      console.error('Audio play failed:', err)
      // Fallback to Web Speech API if audio playback fails
      if (fallbackText) {
        speakText(fallbackText)
      }
    })
    audio.onended = () => URL.revokeObjectURL(url)
  } catch (e) {
    console.error('Audio decode failed:', e)
    // Fallback to Web Speech API
    if (fallbackText) {
      speakText(fallbackText)
    }
  }
}

/**
 * Fallback TTS using Web Speech API (browser-based, works offline).
 * Used when backend edge-tts fails.
 */
function speakText(text: string) {
  try {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    utterance.rate = 1.1
    utterance.volume = 1.0

    // Try to find English voice
    const voices = window.speechSynthesis.getVoices()
    const englishVoice = voices.find(v => v.lang.startsWith('en'))
    if (englishVoice) {
      utterance.voice = englishVoice
    }

    window.speechSynthesis.cancel() // Stop any ongoing speech
    window.speechSynthesis.speak(utterance)
    console.log('[TTS Fallback] Using Web Speech API')
  } catch (e) {
    console.error('[TTS Fallback] Web Speech API failed:', e)
  }
}
