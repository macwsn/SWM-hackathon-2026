import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWebSocket } from '../hooks/useWebSocket'
import { wsUrl } from '../lib/wsUrl'

export default function MultiAssistantPanel() {
  const { lastMessage, status, send } = useWebSocket(wsUrl('/ws/multi'))
  const navigate = useNavigate()
  const [frames, setFrames] = useState<Record<string, string>>({})
  const [connectedUsers, setConnectedUsers] = useState<Set<string>>(new Set())
  const [callRequests, setCallRequests] = useState<Set<string>>(new Set())
  const [callingUsers, setCallingUsers] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!lastMessage) return
    const msg = lastMessage as { type: string; user_id?: string; data?: string; text?: string; to?: string }

    switch (msg.type) {
      case 'frame':
        if (msg.user_id && msg.data) {
          setFrames((prev) => ({ ...prev, [msg.user_id!]: msg.data! }))
          setConnectedUsers((prev) => new Set(prev).add(msg.user_id!))
        }
        break

      case 'user_connected':
        if (msg.user_id) {
          setConnectedUsers((prev) => new Set(prev).add(msg.user_id!))
        }
        break

      case 'user_disconnected':
        if (msg.user_id) {
          setConnectedUsers((prev) => {
            const next = new Set(prev)
            next.delete(msg.user_id!)
            return next
          })
          setFrames((prev) => {
            const next = { ...prev }
            delete next[msg.user_id!]
            return next
          })
        }
        break

      case 'call_request':
        if (msg.user_id) {
          setCallRequests((prev) => new Set(prev).add(msg.user_id!))
        }
        break

      case 'call_accepted_by_user':
        if (msg.user_id) {
          setCallingUsers((prev) => {
            const next = new Set(prev)
            next.delete(msg.user_id!)
            return next
          })
          navigate(`/caregiver?call=auto`)
        }
        break

      case 'redirect':
        if (msg.to) {
          navigate(msg.to)
        }
        break
    }
  }, [lastMessage, navigate])

  const handleAcceptCall = useCallback((userId: string) => {
    send({ type: 'accept_call', user_id: userId })
    setCallRequests((prev) => {
      const next = new Set(prev)
      next.delete(userId)
      return next
    })
  }, [send])

  const handleRejectCall = useCallback((userId: string) => {
    setCallRequests((prev) => {
      const next = new Set(prev)
      next.delete(userId)
      return next
    })
  }, [])

  const handleInitiateCall = useCallback((userId: string) => {
    send({ type: 'initiate_call', user_id: userId })
    setCallingUsers((prev) => new Set(prev).add(userId))
  }, [send])

  const isConnected = status === 'open'
  const userIds = Array.from(connectedUsers)
  const gridCols = userIds.length <= 1 ? 'grid-cols-1' : userIds.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'

  return (
    <div className="h-screen bg-brutal-darker flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-brutal-pink border-b-4 border-black px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📡</span>
          <h1 className="text-black font-black uppercase text-lg">MULTI ASSISTANT</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="tag-brutal bg-brutal-blue text-white flex items-center gap-1">
            <span className="text-sm">👥</span> {userIds.length} KAMER
          </span>
          <span className={`tag-brutal ${isConnected ? 'bg-brutal-green text-black' : 'bg-brutal-red text-white'}`}>
            <span className="inline-flex items-center gap-1">
              <span className={`inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-black' : 'bg-white animate-blink'}`} />
              {isConnected ? 'ONLINE' : 'OFFLINE'}
            </span>
          </span>
          <a href="/" className="text-black text-xs underline font-bold hover:text-white transition-colors">MENU</a>
        </div>
      </div>

      {/* Call request banners */}
      {Array.from(callRequests).map((uid) => (
        <div key={uid} className="flex-shrink-0 bg-brutal-yellow border-b-4 border-black p-3 flex items-center justify-between animate-slide-up">
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-pulse">📞</span>
            <p className="font-black uppercase text-black text-lg">{uid.toUpperCase()} DZWONI!</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleAcceptCall(uid)}
              className="btn-brutal bg-brutal-green text-black font-black text-sm py-2 px-4 uppercase">
              ODBIERZ
            </button>
            <button onClick={() => handleRejectCall(uid)}
              className="btn-brutal bg-brutal-red text-white font-black text-sm py-2 px-4 uppercase">
              ODRZUĆ
            </button>
          </div>
        </div>
      ))}

      {/* Camera grid */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className={`flex-1 grid ${gridCols} gap-2 p-2`}>
          {userIds.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center gap-4">
              <div className="w-20 h-20 border-4 border-brutal-yellow border-dashed rounded-full flex items-center justify-center animate-spin-slow">
                <span className="text-brutal-yellow text-3xl animate-none">📡</span>
              </div>
              <span className="text-brutal-yellow font-black uppercase animate-pulse text-xl">
                Oczekiwanie na kamery użytkowników...
              </span>
              <span className="text-brutal-yellow/50 font-bold text-xs uppercase">
                Użytkownicy powinni połączyć się przez /user/ID
              </span>
            </div>
          )}
          {userIds.map((uid) => (
            <div key={uid} className="relative bg-gray-900 overflow-hidden border-4 border-black shadow-brutal scanlines group">
              {frames[uid] ? (
                <img
                  src={`data:image/jpeg;base64,${frames[uid]}`}
                  alt={`Kamera ${uid}`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-grid-light">
                  <div className="text-center">
                    <span className="text-3xl block mb-1">📷</span>
                    <span className="text-gray-500 text-xs font-bold">Brak klatek</span>
                  </div>
                </div>
              )}

              {/* User label */}
              <div className="absolute top-2 left-2 bg-black/80 px-3 py-1 border-2 border-brutal-yellow flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-brutal-green animate-pulse" />
                <span className="text-brutal-yellow text-xs font-black uppercase">{uid}</span>
              </div>

              {/* Live badge */}
              {frames[uid] && (
                <div className="absolute top-2 right-2 bg-brutal-red px-2 py-0.5 border-2 border-black">
                  <span className="text-white text-xs font-black">● LIVE</span>
                </div>
              )}

              {/* Call button */}
              <div className="absolute bottom-2 right-2 opacity-80 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleInitiateCall(uid)}
                  disabled={callingUsers.has(uid)}
                  className={`btn-brutal text-xs font-black uppercase py-1.5 px-4 flex items-center gap-1
                    ${callingUsers.has(uid)
                      ? 'bg-brutal-yellow text-black animate-pulse'
                      : 'bg-brutal-blue text-white hover:bg-brutal-pink'}`}
                >
                  📞 {callingUsers.has(uid) ? 'DZWONIĘ…' : 'ZADZWOŃ'}
                </button>
              </div>

              {/* Calling this user overlay */}
              {callingUsers.has(uid) && (
                <div className="absolute inset-0 bg-brutal-yellow/10 border-4 border-brutal-yellow animate-pulse_border pointer-events-none" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 bg-black border-t-4 border-brutal-pink px-4 py-1 flex items-center justify-between">
        <a href="/" className="text-brutal-pink font-bold text-xs uppercase underline">← MENU</a>
        <span className="text-brutal-pink/50 text-xs font-bold">BLIND ASSIST — MULTI ASSISTANT</span>
      </div>
    </div>
  )
}
