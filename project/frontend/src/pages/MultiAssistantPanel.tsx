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
    <div className="h-screen bg-black flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-brutal-pink border-b-4 border-black px-4 py-2 flex items-center justify-between flex-shrink-0">
        <h1 className="text-black font-black uppercase text-lg">MULTI ASSISTANT</h1>
        <div className="flex items-center gap-3">
          <span className="tag-brutal bg-brutal-blue text-white">{userIds.length} KAMER</span>
          <span className={`tag-brutal ${isConnected ? 'bg-brutal-green text-black' : 'bg-brutal-red text-white'}`}>
            {isConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
          <a href="/" className="text-black text-xs underline font-bold">MENU</a>
        </div>
      </div>

      {/* Call request banners */}
      {Array.from(callRequests).map((uid) => (
        <div key={uid} className="flex-shrink-0 bg-brutal-yellow border-b-4 border-black p-3 flex items-center justify-between animate-pulse">
          <p className="font-black uppercase text-black text-lg">📞 {uid.toUpperCase()} DZWONI!</p>
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

      {/* Camera grid + alerts */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className={`flex-1 grid ${gridCols} gap-1 p-1`}>
          {userIds.length === 0 && (
            <div className="col-span-full flex items-center justify-center">
              <span className="text-brutal-yellow font-black uppercase animate-pulse text-xl">
                Oczekiwanie na kamery użytkowników...
              </span>
            </div>
          )}
          {userIds.map((uid) => (
            <div key={uid} className="relative bg-gray-900 overflow-hidden">
              {frames[uid] ? (
                <img
                  src={`data:image/jpeg;base64,${frames[uid]}`}
                  alt={`Kamera ${uid}`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-gray-500 text-xs">Brak klatek</span>
                </div>
              )}
              <div className="absolute top-1 left-1 bg-black/80 px-2 py-0.5 border border-brutal-yellow">
                <span className="text-brutal-yellow text-xs font-black uppercase">{uid}</span>
              </div>
              <div className="absolute bottom-1 right-1">
                <button
                  onClick={() => handleInitiateCall(uid)}
                  disabled={callingUsers.has(uid)}
                  className={`btn-brutal text-xs font-black uppercase py-1 px-3
                    ${callingUsers.has(uid)
                      ? 'bg-brutal-yellow text-black animate-pulse'
                      : 'bg-brutal-blue text-white hover:bg-brutal-pink'}`}
                >
                  {callingUsers.has(uid) ? '📞 DZWONIĘ…' : '📞 ZADZWOŃ'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
