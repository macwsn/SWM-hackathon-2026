import { useRef, useState, useCallback, useEffect } from 'react'
import { wsUrl } from '../lib/wsUrl'

const STUN = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

export type CallState = 'idle' | 'calling' | 'incoming' | 'in-call'

export function useWebRTC(role: 'user' | 'caregiver') {
  const [callState, setCallState] = useState<CallState>('idle')
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const pendingOfferRef = useRef<string | null>(null)
  const iceCandidateBuffer = useRef<RTCIceCandidateInit[]>([])
  const waitingForOfferRef = useRef(false)

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  const cleanup = useCallback(() => {
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
      remoteAudioRef.current = null
    }
    pendingOfferRef.current = null
    iceCandidateBuffer.current = []
    waitingForOfferRef.current = false
  }, [])

  const flushIceCandidates = useCallback(async (pc: RTCPeerConnection) => {
    for (const candidate of iceCandidateBuffer.current) {
      await pc.addIceCandidate(candidate).catch(console.error)
    }
    iceCandidateBuffer.current = []
  }, [])

  const createPC = useCallback(() => {
    pcRef.current?.close()
    const pc = new RTCPeerConnection(STUN)

    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: 'ice-candidate', candidate: e.candidate.toJSON() })
    }

    pc.ontrack = (e) => {
      if (!remoteAudioRef.current) {
        remoteAudioRef.current = new Audio()
        remoteAudioRef.current.autoplay = true
      }
      remoteAudioRef.current.srcObject = e.streams[0]
      remoteAudioRef.current.play().catch(console.error)
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setCallState('in-call')
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        cleanup()
        setCallState('idle')
      }
    }

    pcRef.current = pc
    return pc
  }, [send, cleanup])

  const getMic = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    localStreamRef.current = stream
    return stream
  }

  // Unlock audio element on user gesture (required for mobile browsers)
  const unlockAudio = useCallback(() => {
    if (!remoteAudioRef.current) {
      remoteAudioRef.current = new Audio()
      remoteAudioRef.current.autoplay = true
    }
    remoteAudioRef.current.play().catch(() => {})
  }, [])

  // Request a call — user sends call-request, caregiver creates the offer
  const requestCall = useCallback(() => {
    unlockAudio()
    send({ type: 'call-request' })
    waitingForOfferRef.current = true
    setCallState('calling')
  }, [send, unlockAudio])

  // Create offer and send it (only caregiver does this)
  const startCall = useCallback(async () => {
    unlockAudio()
    try {
      const pc = createPC()
      const stream = await getMic()
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      send({ type: 'offer', sdp: offer.sdp })
      setCallState('calling')
    } catch (e) {
      console.error('[WebRTC] startCall failed:', e)
      cleanup()
      setCallState('idle')
    }
  }, [createPC, send, cleanup])

  const answerCall = useCallback(async () => {
    unlockAudio()
    const offerSdp = pendingOfferRef.current
    if (!offerSdp) return
    try {
      const pc = createPC()
      const stream = await getMic()
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp })
      await flushIceCandidates(pc)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      send({ type: 'answer', sdp: answer.sdp })
      setCallState('in-call')
      pendingOfferRef.current = null
    } catch (e) {
      console.error('[WebRTC] answerCall failed:', e)
      cleanup()
      setCallState('idle')
    }
  }, [createPC, send, cleanup, flushIceCandidates])

  const hangUp = useCallback(() => {
    send({ type: 'hangup' })
    cleanup()
    setCallState('idle')
  }, [send, cleanup])

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      const ws = new WebSocket(wsUrl(`/ws/webrtc/${role}`))
      wsRef.current = ws

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data)
        switch (data.type) {
          case 'call-request':
            // User wants to call — show incoming on caregiver
            setCallState('incoming')
            break

          case 'offer':
            if (waitingForOfferRef.current) {
              // User requested the call, auto-answer the offer from caregiver
              pendingOfferRef.current = data.sdp
              // Small delay to ensure mic permission prompt shows on user gesture
              const pc = createPC()
              try {
                const stream = await getMic()
                stream.getTracks().forEach((t) => pc.addTrack(t, stream))
                await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
                await flushIceCandidates(pc)
                const answer = await pc.createAnswer()
                await pc.setLocalDescription(answer)
                send({ type: 'answer', sdp: answer.sdp })
                setCallState('in-call')
                waitingForOfferRef.current = false
              } catch (e) {
                console.error('[WebRTC] auto-answer failed:', e)
                cleanup()
                setCallState('idle')
              }
            } else {
              // Normal incoming call
              pendingOfferRef.current = data.sdp
              setCallState('incoming')
            }
            break

          case 'answer':
            if (pcRef.current) {
              await pcRef.current.setRemoteDescription({ type: 'answer', sdp: data.sdp })
              await flushIceCandidates(pcRef.current)
              setCallState('in-call')
            }
            break

          case 'ice-candidate':
            if (data.candidate) {
              if (pcRef.current && pcRef.current.remoteDescription) {
                await pcRef.current.addIceCandidate(data.candidate).catch(console.error)
              } else {
                iceCandidateBuffer.current.push(data.candidate)
              }
            }
            break

          case 'hangup':
            cleanup()
            setCallState('idle')
            break
        }
      }

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 2000)
      }
    }

    connect()
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      wsRef.current?.close()
    }
  }, [role, cleanup, createPC, send, flushIceCandidates])

  return { callState, startCall, requestCall, answerCall, hangUp }
}
