/**
 * VisionAssist – useWebSocket Hook
 * Manages WebSocket connection with auto-reconnect and frame sending.
 */
import { useState, useRef, useCallback, useEffect } from 'react';

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 10000;

export function useWebSocket(url, role = 'user') {
  const wsRef = useRef(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef(null);

  const [status, setStatus] = useState('disconnected'); // connected | reconnecting | disconnected
  const [lastAnalysis, setLastAnalysis] = useState(null);
  const [lastFrame, setLastFrame] = useState(null); // Added for broadcast frames
  const [error, setError] = useState(null);

  const connect = useCallback(() => {
    // Build full WebSocket URL
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    let wsUrl = url || `${wsProtocol}://${window.location.host}/ws`;
    
    // Append role
    const urlObj = new URL(wsUrl, window.location.origin);
    urlObj.searchParams.set('role', role);
    wsUrl = urlObj.toString();

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      setStatus('reconnecting');

      ws.onopen = () => {
        setStatus('connected');
        setError(null);
        reconnectAttempt.current = 0;
        console.log('[WS] Connected to', wsUrl);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'analysis') {
            setLastAnalysis((prev) => {
              if (!prev) return data;
              return {
                ...data,
                depth_map: data.depth_map || prev.depth_map,
                depth_min_m: typeof data.depth_min_m === 'number' ? data.depth_min_m : prev.depth_min_m,
                depth_max_m: typeof data.depth_max_m === 'number' ? data.depth_max_m : prev.depth_max_m,
              };
            });
          } else if (data.type === 'broadcast') {
            // Guardian mode: receive broadcasted frames and analysis
            setLastFrame(data.frame);
            const analysisData = data.analysis;
            if (analysisData) {
              setLastAnalysis((prev) => {
                if (!prev) return analysisData;
                return {
                  ...analysisData,
                  depth_map: analysisData.depth_map || prev.depth_map,
                  depth_min_m: typeof analysisData.depth_min_m === 'number' ? analysisData.depth_min_m : prev.depth_min_m,
                  depth_max_m: typeof analysisData.depth_max_m === 'number' ? analysisData.depth_max_m : prev.depth_max_m,
                };
              });
            }
          } else if (data.type === 'error') {
            console.error('Backend error:', data.message);
          } else {
            console.log('WS message:', data.type);
          }
        } catch (e) {
          console.error('Failed to parse WS message:', e);
        }
      };

      ws.onclose = (event) => {
        console.log('[WS] Disconnected, code:', event.code);
        setStatus('disconnected');
        scheduleReconnect();
      };

      ws.onerror = (event) => {
        console.error('[WS] Error:', event);
        setError('Błąd połączenia z serwerem');
      };
    } catch (e) {
      console.error('[WS] Connection failed:', e);
      setError(e.message);
      scheduleReconnect();
    }
  }, [url]);

  const scheduleReconnect = useCallback(() => {
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempt.current),
      RECONNECT_MAX_DELAY
    );
    reconnectAttempt.current += 1;
    setStatus('reconnecting');

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempt.current})`);
    reconnectTimer.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  const sendFrame = useCallback((base64Data, depthMode = 'indoor') => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'frame',
          data: base64Data,
          depth_mode: depthMode,
          timestamp: Date.now(),
        })
      );
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return {
    status,
    lastAnalysis,
    lastFrame,
    error,
    connect,
    disconnect,
    sendFrame,
  };
}
