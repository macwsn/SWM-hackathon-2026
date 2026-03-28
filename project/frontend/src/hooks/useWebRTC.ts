import { useRef, useState, useCallback, useEffect } from 'react'

import { wsUrl } from '../lib/wsUrl'

const STUN = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
const WS_URL = (role: string) => wsUrl(`/ws/webrtc/${role}`)

export type CallState = 'idle' | 'calling' | 'incoming' | 'in-call'

export function useWebRTC(role: 'user' | 'caregiver') {
  const [callState, setCallState] = useState<CallState>('idle')
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  const send = (data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }

  const createPC = useCallback(() => {
    const pc = new RTCPeerConnection(STUN)

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        send({ type: 'ice-candidate', candidate: e.candidate.toJSON() })
      }
    }

    pc.ontrack = (e) => {
      const audio = new Audio()
      audio.srcObject = e.streams[0]
      audio.play().catch(console.error)
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setCallState('in-call')
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setCallState('idle')
      }
    }

    pcRef.current = pc
    return pc
  }, [])

  const getMic = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    localStreamRef.current = stream
    return stream
  }

  // Caregiver initiates call
  const startCall = useCallback(async () => {
    const pc = createPC()
    const stream = await getMic()
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))
    send({ type: 'call-request' })
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    send({ type: 'offer', sdp: offer.sdp })
    setCallState('calling')
  }, [createPC])

  // User answers incoming call
  const answerCall = useCallback(async (offerSdp: string) => {
    const pc = createPC()
    const stream = await getMic()
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))
    await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp })
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    send({ type: 'answer', sdp: answer.sdp })
    setCallState('in-call')
  }, [createPC])

  const hangUp = useCallback(() => {
    send({ type: 'hangup' })
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    setCallState('idle')
  }, [])

  useEffect(() => {
    const ws = new WebSocket(WS_URL(role))
    wsRef.current = ws

    let pendingOffer: string | null = null

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data)

      switch (data.type) {
        case 'call-request':
          setCallState('incoming')
          break

        case 'offer':
          pendingOffer = data.sdp
          if (role === 'user') setCallState('incoming')
          break

        case 'answer':
          if (pcRef.current) {
            await pcRef.current.setRemoteDescription({ type: 'answer', sdp: data.sdp })
            setCallState('in-call')
          }
          break

        case 'ice-candidate':
          if (pcRef.current && data.candidate) {
            await pcRef.current.addIceCandidate(data.candidate).catch(console.error)
          }
          break

        case 'hangup':
          pcRef.current?.close()
          pcRef.current = null
          setCallState('idle')
          break

        case 'peer-connected':
          // Counterpart connected to signaling
          break
      }
    }

    // Expose pendingOffer for answerCall
    ;(ws as unknown as Record<string, unknown>)._pendingOffer = () => pendingOffer

    ws.onclose = () => setTimeout(() => {
      const newWs = new WebSocket(WS_URL(role))
      wsRef.current = newWs
    }, 2000)

    return () => ws.close()
  }, [role])

  return { callState, startCall, answerCall, hangUp }
}
