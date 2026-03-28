import { useEffect, useRef, useState, useCallback } from 'react'

export type AICallState = 'idle' | 'starting' | 'active' | 'error'

/**
 * Hook for managing bidirectional audio streaming with Gemini Live API
 * when no caregiver is available.
 */
export function useAIAudioCall(wsRef: React.MutableRefObject<WebSocket | null>) {
  const [aiCallState, setAICallState] = useState<AICallState>('idle')
  const [error, setError] = useState<string | null>(null)
  
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const audioQueueRef = useRef<Float32Array[]>([])
  const isPlayingRef = useRef(false)
  const audioBufferRef = useRef<Int16Array>(new Int16Array(0))
  const lastSendTimeRef = useRef<number>(0)

  // Start AI audio call
  const startAICall = useCallback(async () => {
    try {
      setAICallState('starting')
      setError(null)
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,  // Gemini Live API expects 16kHz
          channelCount: 1,    // Mono
          echoCancellation: true,
          noiseSuppression: true
        }
      })
      
      localStreamRef.current = stream
      
      // Create audio context for processing
      audioContextRef.current = new AudioContext({ sampleRate: 16000 })
      const source = audioContextRef.current.createMediaStreamSource(stream)

      // Create script processor with larger buffer to reduce chunk frequency
      // 8192 samples at 16kHz = ~512ms per chunk = ~2 chunks/second (down from 8/second)
      const processor = audioContextRef.current.createScriptProcessor(8192, 1, 1)
      processorRef.current = processor

      // Minimum time between sends: 400ms (max ~2.5 chunks/second)
      const MIN_SEND_INTERVAL_MS = 400

      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return

        const inputData = e.inputBuffer.getChannelData(0)

        // Convert Float32 to Int16 PCM
        const pcmData = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]))
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }

        // Accumulate audio data in buffer
        const newBuffer = new Int16Array(audioBufferRef.current.length + pcmData.length)
        newBuffer.set(audioBufferRef.current)
        newBuffer.set(pcmData, audioBufferRef.current.length)
        audioBufferRef.current = newBuffer

        // Throttle: Only send if enough time has passed
        const now = Date.now()
        if (now - lastSendTimeRef.current < MIN_SEND_INTERVAL_MS) {
          return // Skip this chunk, will accumulate in buffer
        }

        // Send accumulated buffer
        if (audioBufferRef.current.length > 0) {
          const base64 = btoa(String.fromCharCode(...new Uint8Array(audioBufferRef.current.buffer)))

          wsRef.current.send(JSON.stringify({
            type: 'audio_chunk',
            data: base64
          }))

          // Reset buffer and timestamp
          audioBufferRef.current = new Int16Array(0)
          lastSendTimeRef.current = now
        }
      }
      
      source.connect(processor)
      processor.connect(audioContextRef.current.destination)
      
      // Request backend to start AI call
      wsRef.current?.send(JSON.stringify({ type: 'start_ai_call' }))
      
    } catch (err) {
      console.error('[AIAudioCall] Failed to start:', err)
      setError(err instanceof Error ? err.message : 'Failed to start AI call')
      setAICallState('error')
      cleanup()
    }
  }, [wsRef])

  // End AI audio call
  const endAICall = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'end_ai_call' }))
    cleanup()
    setAICallState('idle')
  }, [wsRef])

  // Cleanup resources
  const cleanup = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }

    audioQueueRef.current = []
    isPlayingRef.current = false
    audioBufferRef.current = new Int16Array(0)
    lastSendTimeRef.current = 0
  }, [])

  // Play received audio chunk
  const playAudioChunk = useCallback(async (base64Data: string) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 })  // Gemini outputs 24kHz
    }
    
    try {
      // Decode base64 to PCM
      const binaryString = atob(base64Data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      
      // Convert Int16 PCM to Float32
      const pcmData = new Int16Array(bytes.buffer)
      const floatData = new Float32Array(pcmData.length)
      for (let i = 0; i < pcmData.length; i++) {
        floatData[i] = pcmData[i] / 0x8000
      }
      
      // Add to playback queue
      audioQueueRef.current.push(floatData)
      
      // Start playback if not already playing
      if (!isPlayingRef.current) {
        processAudioQueue()
      }
    } catch (err) {
      console.error('[AIAudioCall] Failed to play audio chunk:', err)
    }
  }, [])

  // Process audio queue
  const processAudioQueue = async () => {
    if (!audioContextRef.current || audioQueueRef.current.length === 0) {
      isPlayingRef.current = false
      return
    }

    isPlayingRef.current = true
    const chunk = audioQueueRef.current.shift()!

    const audioBuffer = audioContextRef.current.createBuffer(1, chunk.length, 24000)
    audioBuffer.getChannelData(0).set(chunk)

    const source = audioContextRef.current.createBufferSource()
    source.buffer = audioBuffer
    source.connect(audioContextRef.current.destination)
    source.onended = () => processAudioQueue()
    source.start()
  }

  // Clear audio queue when interrupted
  const clearAudioQueue = useCallback(() => {
    console.log('[AIAudioCall] Clearing audio queue due to interruption')
    audioQueueRef.current = []
    isPlayingRef.current = false

    // Stop any currently playing audio by closing and recreating the context
    if (audioContextRef.current && audioContextRef.current.state === 'running') {
      audioContextRef.current.suspend()
    }
  }, [])

  // Listen for AI call state changes from backend
  useEffect(() => {
    const ws = wsRef.current
    if (!ws) return

    const originalOnMessage = ws.onmessage

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        // Handle AI call started confirmation
        if (msg.type === 'ai_call_started') {
          setAICallState('active')
        }

        // Handle AI call rejected (e.g., caregiver available)
        if (msg.type === 'ai_call_rejected') {
          console.log('[AIAudioCall] Call rejected:', msg.reason)
          setError(msg.reason || 'AI call unavailable')
          cleanup()
          setAICallState('idle')
        }

        // Handle AI call ended confirmation
        if (msg.type === 'ai_call_ended') {
          cleanup()
          setAICallState('idle')
        }

        // Handle AI call error
        if (msg.type === 'ai_call_error') {
          setError(msg.message || 'AI call error')
          cleanup()
          setAICallState('error')
        }
      } catch (e) {
        // Ignore JSON parse errors
      }

      // Call original handler if it exists
      if (originalOnMessage) {
        originalOnMessage.call(ws, event)
      }
    }

    return () => {
      ws.onmessage = originalOnMessage
    }
  }, [wsRef, cleanup])

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup()
  }, [cleanup])

  return {
    aiCallState,
    error,
    startAICall,
    endAICall,
    playAudioChunk,
    clearAudioQueue
  }
}

