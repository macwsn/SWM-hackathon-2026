/**
 * MOCK: Smelter video stream component.
 *
 * Plays the backend video stream directly via a native <video> element.
 * Exposes the video element via forwardRef so parents can capture frames.
 *
 * REAL SMELTER INTEGRATION (to replace this file):
 * ─────────────────────────────────────────────────
 * 1. docker run -p 8090:8090 ghcr.io/software-mansion/smelter
 * 2. npm install @smelter-dev/browser @smelter-dev/react
 * 3. Replace <video> with Smelter React components receiving WHEP stream
 * Reference: https://github.com/software-mansion/smelter
 */

import React from 'react'

interface VideoStreamMockProps {
  /** URL to video stream (e.g. "http://localhost:8000/video/stream") */
  src?: string
  className?: string
  label?: string
}

const VideoStreamMock = React.forwardRef<HTMLVideoElement, VideoStreamMockProps>(({
  src,
  className = '',
  label = 'CAMERA (MOCK)',
}, ref) => {
  return (
    <div className={`relative w-full h-full bg-black overflow-hidden ${className}`}>
      {src ? (
        <video
          ref={ref}
          src={src}
          autoPlay
          loop
          muted
          playsInline
          crossOrigin="anonymous"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-brutal-yellow text-xs font-bold uppercase animate-pulse">
            Waiting for stream…
          </span>
        </div>
      )}

      <div className="absolute top-2 left-2 bg-black border-2 border-brutal-yellow px-2 py-0.5">
        <span className="text-brutal-yellow text-xs font-bold">{label}</span>
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <div className={`w-2 h-2 rounded-full ${src ? 'bg-brutal-red animate-pulse' : 'bg-gray-500'}`} />
        <span className="text-white text-xs font-bold">{src ? 'LIVE' : 'N/A'}</span>
      </div>
    </div>
  )
})

VideoStreamMock.displayName = 'VideoStreamMock'

export default VideoStreamMock
