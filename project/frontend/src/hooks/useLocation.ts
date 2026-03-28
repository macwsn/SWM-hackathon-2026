import { useEffect, useRef, useState } from 'react'
import type { LocationData } from '../types'

/**
 * Attempts to get real GPS from browser.
 * Falls back gracefully if permission denied.
 * Sends location to backend via user WebSocket.
 */
export function useLocation(sendWs: (data: object) => void) {
  const [location, setLocation] = useState<LocationData | null>(null)
  const watchIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) return

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc: LocationData = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        }
        setLocation(loc)
        sendWs({ type: 'location', ...loc })
      },
      (err) => {
        console.warn('[GPS] unavailable:', err.message)
      },
      { enableHighAccuracy: true, maximumAge: 1000 },
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [sendWs])

  return location
}
