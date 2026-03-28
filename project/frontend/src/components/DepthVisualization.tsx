import React from 'react'
import type { DepthFrame } from '../types'

interface DepthVisualizationProps {
  frame: DepthFrame | null
}

const DepthVisualization: React.FC<DepthVisualizationProps> = ({ frame }) => {
  if (!frame) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <span className="text-brutal-yellow font-bold text-sm uppercase">
          Oczekiwanie na model…
        </span>
      </div>
    )
  }

  const distColor =
    frame.min_distance < 1.0
      ? 'text-brutal-red'
      : frame.min_distance < 2.0
      ? 'text-brutal-yellow'
      : 'text-brutal-green'

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <img
        src={`data:image/jpeg;base64,${frame.data}`}
        alt="depth map"
        className="w-full h-full object-cover"
      />

      {/* Overlays */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="tag-brutal bg-brutal-yellow text-black text-xs">
            {frame.is_indoor ? 'WNĘTRZE' : 'ZEWNĄTRZ'}
          </span>
          <span className={`font-black text-lg ${distColor}`}>
            {frame.min_distance.toFixed(2)} m
          </span>
        </div>
        <span className="text-gray-400 text-xs font-bold">
          {frame.inference_ms.toFixed(0)} ms
        </span>
      </div>

      {/* Colormap legend */}
      <div className="absolute top-2 right-2 flex flex-col items-end gap-0.5">
        <span className="text-yellow-300 text-xs font-bold">BLISKO</span>
        <div
          className="w-3 h-16 border border-white"
          style={{
            background:
              'linear-gradient(to bottom, #f0f921, #cc4778, #0d0887)',
          }}
        />
        <span className="text-purple-400 text-xs font-bold">DALEKO</span>
      </div>
    </div>
  )
}

export default DepthVisualization
