import { useState, useRef, useCallback } from 'react'

type Phase = 'idle' | 'scanning' | 'success' | 'fail'

interface FingerprintModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function FingerprintModal({ open, onClose, onSuccess }: FingerprintModalProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTouchStart = useCallback(() => {
    if (phase !== 'idle') return
    setPhase('scanning')

    // Simulate fingerprint scanning — hold for 1.5s
    timerRef.current = setTimeout(() => {
      setPhase('success')
      if (navigator.vibrate) navigator.vibrate([50, 30, 50])
      // Redirect after brief success animation
      setTimeout(() => {
        onSuccess()
      }, 600)
    }, 1500)
  }, [phase, onSuccess])

  const handleTouchEnd = useCallback(() => {
    if (phase === 'scanning') {
      // Released too early
      if (timerRef.current) clearTimeout(timerRef.current)
      setPhase('fail')
      if (navigator.vibrate) navigator.vibrate(200)
      setTimeout(() => setPhase('idle'), 1000)
    }
  }, [phase])

  const handleClose = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPhase('idle')
    onClose()
  }

  if (!open) return null

  const ringColor =
    phase === 'scanning' ? 'border-brutal-yellow animate-pulse'
    : phase === 'success' ? 'border-brutal-green'
    : phase === 'fail' ? 'border-brutal-red'
    : 'border-white/30'

  const bgColor =
    phase === 'success' ? 'bg-brutal-green/20'
    : phase === 'fail' ? 'bg-brutal-red/20'
    : 'bg-white/5'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4" onClick={handleClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80" />

      {/* Modal panel — slides up from bottom like Android */}
      <div
        className="relative bg-[#1c1c2e] border-4 border-black shadow-brutal-lg rounded-t-xl w-full max-w-sm animate-slide-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-2 text-center">
          <h2 className="text-white font-black text-lg uppercase">Biometric Login</h2>
          <p className="text-white/50 text-xs font-bold mt-1">
            {phase === 'idle' && 'Touch and hold the fingerprint sensor'}
            {phase === 'scanning' && 'Scanning…'}
            {phase === 'success' && 'Identity confirmed!'}
            {phase === 'fail' && 'Try again — hold longer'}
          </p>
        </div>

        {/* Fingerprint area */}
        <div className="flex items-center justify-center py-8">
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleTouchStart}
            onMouseUp={handleTouchEnd}
            onMouseLeave={handleTouchEnd}
            className={`relative w-28 h-28 rounded-full border-4 ${ringColor} ${bgColor}
              flex items-center justify-center cursor-pointer select-none
              transition-all duration-300 active:scale-95`}
          >
            {/* Scanning ring animation */}
            {phase === 'scanning' && (
              <div className="absolute inset-0 rounded-full border-4 border-brutal-yellow animate-pulse-ring" />
            )}
            {phase === 'success' && (
              <div className="absolute inset-0 rounded-full border-4 border-brutal-green animate-pulse-ring" />
            )}

            {/* Fingerprint SVG */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="56" height="56"
              viewBox="0 0 24 24"
              fill="none"
              stroke={
                phase === 'success' ? '#00CC44'
                : phase === 'fail' ? '#FF3333'
                : phase === 'scanning' ? '#FFE500'
                : '#ffffff80'
              }
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-colors duration-300 ${phase === 'scanning' ? 'animate-pulse' : ''}`}
            >
              <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
              <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
              <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
              <path d="M2 12a10 10 0 0 1 18-6" />
              <path d="M2 16h.01" />
              <path d="M21.8 16c.2-2 .131-5.354 0-6" />
              <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
              <path d="M8.65 22c.21-.66.45-1.32.57-2" />
              <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
            </svg>

            {/* Success checkmark overlay */}
            {phase === 'success' && (
              <div className="absolute inset-0 flex items-center justify-center bg-brutal-green/30 rounded-full">
                <span className="text-4xl">✓</span>
              </div>
            )}
          </div>
        </div>

        {/* Cancel button */}
        <div className="px-6 pb-6">
          <button
            onClick={handleClose}
            className="w-full btn-brutal bg-white/10 text-white/70 text-sm py-2 hover:bg-white/20"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  )
}
