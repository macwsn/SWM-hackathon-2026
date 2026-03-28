import { useState, useEffect } from 'react'

/**
 * Simple mobile detection hook for biometric mock UI.
 * No real biometric auth — just checks if we're on a mobile device.
 */
export function useBiometricAuth() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent))
  }, [])

  return { isMobile }
}
