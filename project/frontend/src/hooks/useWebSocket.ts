import { useEffect, useRef, useState, useCallback } from 'react'

export type WsStatus = 'connecting' | 'open' | 'closed' | 'error'

export function useWebSocket<T = unknown>(url: string) {
  const wsRef = useRef<WebSocket | null>(null)
  const [lastMessage, setLastMessage] = useState<T | null>(null)
  const [status, setStatus] = useState<WsStatus>('connecting')
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(url)
    wsRef.current = ws
    setStatus('connecting')

    ws.onopen = () => setStatus('open')
    ws.onclose = () => {
      setStatus('closed')
      reconnectTimer.current = setTimeout(connect, 2000)
    }
    ws.onerror = () => setStatus('error')
    ws.onmessage = (event) => {
      try {
        setLastMessage(JSON.parse(event.data) as T)
      } catch {
        // ignore non-JSON
      }
    }
  }, [url])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return { lastMessage, status, send, ws: wsRef }
}
