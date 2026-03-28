import React, { useEffect, useRef, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { wsUrl } from '../lib/wsUrl'
import { useWebRTC } from '../hooks/useWebRTC'
import AlertChat from '../components/AlertChat'
import MapView from '../components/MapView'
import type { AlertMessage, LocationData } from '../types'

const MAX_TRAIL = 60
const MAX_ALERTS = 50

export default function CaregiverPanel() {
  const { lastMessage, status, send } = useWebSocket(wsUrl('/ws/caregiver'))
  const { callState, startCall, hangUp } = useWebRTC('caregiver')

  const [alerts, setAlerts] = useState<AlertMessage[]>([])
  const [location, setLocation] = useState<LocationData | null>(null)
  const [trail, setTrail] = useState<LocationData[]>([])
  const [voiceText, setVoiceText] = useState('')
  const [lastFrame, setLastFrame] = useState<string | null>(null)

  // Remote frames handled via WebSocket
  useEffect(() => {
    if (!lastMessage) return
    const msg = lastMessage as { type: string; data?: string; text?: string; distance?: number; is_indoor?: boolean; timestamp?: number; lat?: number; lon?: number; speed?: number; heading?: number }

    if (msg.type === 'frame' && msg.data) {
      setLastFrame(msg.data)
      return
    }

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
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-brutal-blue border-b-4 border-black px-4 py-2 flex items-center justify-between flex-shrink-0">
        <h1 className="text-white font-black uppercase text-lg">PANEL OPIEKUNA</h1>
        <div className="flex items-center gap-3">
          <span className={`tag-brutal ${isConnected ? 'bg-brutal-green text-black' : 'bg-brutal-red text-white'}`}>
            {isConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
          {callState !== 'idle' && (
            <span className="tag-brutal bg-brutal-yellow text-black animate-pulse">
              {callState === 'in-call' ? '● ROZMOWA' : callState === 'calling' ? 'DZWONIENIE…' : callState}
            </span>
          )}
          <a href="/" className="text-white text-xs underline font-bold">MENU</a>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: Video stream */}
        <div className="flex-1 border-r-4 border-black overflow-hidden relative bg-black">
          {lastFrame ? (
            <img
              src={`data:image/jpeg;base64,${lastFrame}`}
              alt="Kamera użytkownika"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-brutal-yellow font-black uppercase {isConnected ? 'animate-pulse' : ''}">
                {isConnected ? 'Oczekuję na klatki wideo…' : 'Brak połączenia'}
              </span>
            </div>
          )}
          <div className="absolute top-2 left-2 bg-black/70 px-2 py-0.5 border border-brutal-yellow">
            <span className="text-brutal-yellow text-xs font-black uppercase">KAMERA UŻYTKOWNIKA</span>
          </div>
        </div>

        {/* Right panel */}
        <div className="w-80 flex flex-col border-black overflow-hidden flex-shrink-0">
          {/* Alerts chat */}
          <div className="flex-1 min-h-0 flex flex-col border-b-4 border-black">
            <div className="bg-brutal-red border-b-2 border-black px-3 py-1 flex-shrink-0">
              <span className="text-white font-black uppercase text-sm">ALERTY MODELU</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <AlertChat messages={alerts} />
            </div>
          </div>

          {/* Map */}
          <div className="h-48 border-b-4 border-black flex-shrink-0 overflow-hidden">
            <div className="bg-brutal-yellow border-b-2 border-black px-3 py-1">
              <span className="text-black font-black uppercase text-xs">LOKALIZACJA</span>
            </div>
            <div className="h-full" style={{ height: 'calc(100% - 28px)' }}>
              <MapView location={location} trail={trail} />
            </div>
          </div>

          {/* Voice controls */}
          <div className="p-3 flex-shrink-0 bg-gray-50">
            {/* WebRTC call */}
            <button
              onClick={callState === 'in-call' ? hangUp : startCall}
              className={`btn-brutal w-full mb-2 text-sm py-2 ${
                callState === 'in-call'
                  ? 'bg-brutal-red text-white'
                  : 'bg-brutal-green text-black'
              }`}
            >
              {callState === 'in-call' ? '📞 ROZŁĄCZ' : callState === 'calling' ? '📞 DZWONIENIE…' : '📞 ZADZWOŃ DO UŻYTKOWNIKA'}
            </button>

            {/* Text→TTS fallback */}
            <div className="flex gap-2">
              <input
                value={voiceText}
                onChange={(e) => setVoiceText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendVoice()}
                placeholder="Wiadomość głosowa…"
                className="flex-1 border-2 border-black px-2 py-1 text-xs font-bold focus:outline-none focus:border-brutal-blue"
              />
              <button
                onClick={sendVoice}
                disabled={!voiceText.trim() || !isConnected}
                className="btn-brutal bg-brutal-blue text-white text-xs px-3 disabled:opacity-50"
              >
                WYŚLIJ
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
