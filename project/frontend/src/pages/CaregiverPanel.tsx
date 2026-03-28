import { useEffect, useRef, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useWebRTC } from '../hooks/useWebRTC'
import { wsUrl } from '../lib/wsUrl'
import AlertChat from '../components/AlertChat'
import MapView from '../components/MapView'
import type { AlertMessage, LocationData } from '../types'

const MAX_TRAIL = 60
const MAX_ALERTS = 50

export default function CaregiverPanel() {
  const { lastMessage, status, send } = useWebSocket(wsUrl('/ws/caregiver'))
  const { callState, startCall, answerCall, hangUp } = useWebRTC('caregiver')
  const autoCallDone = useRef(false)

  useEffect(() => {
    if (autoCallDone.current) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('call') === 'auto') {
      autoCallDone.current = true
      setTimeout(() => startCall(), 1000)
    }
  }, [startCall])

  const [alerts, setAlerts] = useState<AlertMessage[]>([])
  const [location, setLocation] = useState<LocationData | null>(null)
  const [trail, setTrail] = useState<LocationData[]>([])
  const [voiceText, setVoiceText] = useState('')
  const [lastFrame, setLastFrame] = useState<string | null>(null)
  const [mapExpanded, setMapExpanded] = useState(false)

  useEffect(() => {
    if (!lastMessage) return
    const msg = lastMessage as { type: string; data?: string; text?: string; distance?: number; is_indoor?: boolean; timestamp?: number; lat?: number; lon?: number; speed?: number; heading?: number }

    if (msg.type === 'frame' && msg.data) { setLastFrame(msg.data); return }

    if (msg.type === 'alert' || msg.type === 'describe_response') {
      const entry: AlertMessage = {
        id: `${Date.now()}-${Math.random()}`,
        type: msg.type === 'alert' ? 'alert' : 'describe_response',
        text: msg.text ?? '',
        distance: msg.distance,
        is_indoor: msg.is_indoor,
        timestamp: msg.timestamp ?? Date.now() / 1000,
      }
      setAlerts((prev) => [...prev.slice(-MAX_ALERTS + 1), entry])
    }

    if (msg.type === 'location' && msg.lat !== undefined && msg.lon !== undefined) {
      const loc: LocationData = { lat: msg.lat, lon: msg.lon, speed: msg.speed, heading: msg.heading, timestamp: msg.timestamp }
      setLocation(loc)
      setTrail((prev) => [...prev.slice(-MAX_TRAIL + 1), loc])
    }
  }, [lastMessage])

  const sendVoice = () => {
    const text = voiceText.trim()
    if (!text) return
    send({ type: 'send_voice_text', text })
    setVoiceText('')
  }

  const isConnected = status === 'open'

  return (
    <div className="h-screen bg-brutal-dark flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-[#0066FF] border-b-4 border-black px-4 py-2 flex items-center justify-between flex-shrink-0 relative">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🛡️</span>
          <h1 className="text-white font-black uppercase text-lg">CAREGIVER PANEL</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className={`tag-brutal ${isConnected ? 'bg-brutal-green text-black' : 'bg-brutal-red text-white'}`}>
            <span className="inline-flex items-center gap-1">
              <span className={`inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-black' : 'bg-white animate-blink'}`} />
              {isConnected ? 'ONLINE' : 'OFFLINE'}
            </span>
          </span>
          {callState !== 'idle' && (
            <span className="tag-brutal bg-brutal-yellow text-black animate-pulse">
              {callState === 'in-call' ? '● IN CALL' : callState === 'calling' ? 'CALLING…' : callState}
            </span>
          )}
          <a href="/" className="text-white text-xs underline font-bold hover:text-brutal-yellow transition-colors">MENU</a>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: Video stream */}
        <div className="flex-1 border-r-4 border-black overflow-hidden relative bg-black scanlines">
          {lastFrame ? (
            <img
              src={`data:image/jpeg;base64,${lastFrame}`}
              alt="User camera"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-grid-light">
              <div className="text-center">
                <span className="text-5xl block mb-3">📷</span>
                <span className={`text-brutal-yellow font-black uppercase ${isConnected ? 'animate-pulse' : ''}`}>
                  {isConnected ? 'Waiting for video frames…' : 'No connection'}
                </span>
              </div>
            </div>
          )}
          {/* Camera label */}
          <div className="absolute top-2 left-2 bg-black/80 px-3 py-1 border-2 border-brutal-yellow flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-brutal-red animate-pulse" />
            <span className="text-brutal-yellow text-xs font-black uppercase">USER CAMERA</span>
          </div>
          {/* Live badge */}
          {lastFrame && (
            <div className="absolute top-2 right-2 bg-brutal-red px-2 py-0.5 border-2 border-black">
              <span className="text-white text-xs font-black">● LIVE</span>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-80 flex flex-col overflow-hidden flex-shrink-0 bg-white">
          {/* Alerts chat */}
          <div className="flex-1 min-h-0 flex flex-col border-b-4 border-black">
            <div className="bg-brutal-red border-b-2 border-black px-3 py-1.5 flex-shrink-0 flex items-center gap-2">
              <span className="text-sm">⚠️</span>
              <span className="text-white font-black uppercase text-sm">MODEL ALERTS</span>
              <span className="ml-auto bg-white/20 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                {alerts.length}
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto bg-stripes">
              <AlertChat messages={alerts} />
            </div>
          </div>

          {/* Map */}
          <div className="h-80 border-b-4 border-black flex-shrink-0 overflow-hidden relative">
            <div className="bg-brutal-yellow border-b-2 border-black px-3 py-1 flex items-center gap-2">
              <span className="text-sm">📍</span>
              <span className="text-black font-black uppercase text-xs">LOCATION</span>
              {location && (
                <span className="ml-auto text-black/50 text-xs font-bold">
                  {location.lat.toFixed(4)}, {location.lon.toFixed(4)}
                </span>
              )}
            </div>
            <div className="h-full" style={{ height: 'calc(100% - 28px)' }}>
              <MapView location={location} trail={trail} />
            </div>
            {/* Expand button */}
            <button
              onClick={() => setMapExpanded(true)}
              className="absolute bottom-2 right-2 z-[10] bg-black/80 border-2 border-brutal-yellow text-brutal-yellow text-xs font-black px-2 py-1 hover:bg-brutal-yellow hover:text-black transition-colors cursor-pointer"
            >
              ⛶ ENLARGE
            </button>
          </div>

          {/* Incoming call banner */}
          {callState === 'incoming' && (
            <div className="flex-shrink-0 bg-brutal-yellow border-y-4 border-black p-3 flex flex-col gap-2 animate-pulse">
            <p className="font-black uppercase text-black text-lg text-center">📞 USER IS CALLING!</p>
              <div className="flex gap-2">
                <button onClick={startCall} className="flex-1 btn-brutal bg-brutal-green text-black font-black text-sm py-2 uppercase">ANSWER</button>
                <button onClick={hangUp} className="flex-1 btn-brutal bg-brutal-red text-white font-black text-sm py-2 uppercase">REJECT</button>
              </div>
            </div>
          )}

          {/* Voice controls */}
          <div className="p-3 flex-shrink-0 bg-gray-50 border-t border-gray-200">
            <button
              onClick={callState === 'in-call' ? hangUp : startCall}
              disabled={callState === 'incoming'}
              className={`btn-brutal w-full mb-2 text-sm py-2.5 flex items-center justify-center gap-2 ${
                callState === 'in-call'
                  ? 'bg-brutal-green text-black'
                  : callState === 'calling'
                  ? 'bg-brutal-yellow text-black'
                  : 'bg-[#0066FF] text-white'
              }`}
            >
              <span>📞</span>
              {callState === 'in-call' ? 'HANG UP' : callState === 'calling' ? 'CALLING…' : 'CALL USER'}
            </button>

            <div className="flex gap-2">
              <input
                value={voiceText}
                onChange={(e) => setVoiceText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendVoice()}
                placeholder="Voice message…"
                className="flex-1 border-2 border-black px-2 py-1.5 text-xs font-bold focus:outline-none focus:border-[#0066FF] focus:shadow-brutal-blue transition-shadow"
              />
              <button
                onClick={sendVoice}
                disabled={!voiceText.trim() || !isConnected}
                className="btn-brutal bg-brutal-blue text-white text-xs px-3 disabled:opacity-50"
              >
                SEND
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen map overlay */}
      {mapExpanded && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6">
          <div className="relative w-full h-full max-w-4xl max-h-[80vh] border-4 border-brutal-yellow shadow-brutal-lg overflow-hidden">
            <div className="bg-brutal-yellow border-b-4 border-black px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">📍</span>
                <span className="text-black font-black uppercase text-sm">LOCATION — FULL VIEW</span>
              </div>
              {location && (
                <span className="text-black/60 text-xs font-bold">
                  {location.lat.toFixed(5)}, {location.lon.toFixed(5)}
                </span>
              )}
            </div>
            <div className="w-full" style={{ height: 'calc(100% - 44px)' }}>
              <MapView location={location} trail={trail} />
            </div>
            <button
              onClick={() => setMapExpanded(false)}
              className="absolute top-2 right-2 z-[10] bg-black border-2 border-brutal-red text-brutal-red text-xs font-black px-3 py-1.5 hover:bg-brutal-red hover:text-white transition-colors cursor-pointer"
            >
              ✕ CLOSE
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex-shrink-0 bg-black border-t-4 border-brutal-blue px-4 py-1 flex items-center justify-between">
        <a href="/" className="text-brutal-blue font-bold text-xs uppercase underline">← MENU</a>
        <span className="text-brutal-blue/50 text-xs font-bold">AISIGHT — CAREGIVER</span>
      </div>
    </div>
  )
}
