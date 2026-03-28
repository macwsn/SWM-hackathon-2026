import React, { useEffect, useRef, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { wsUrl } from '../lib/wsUrl'
import DepthVisualization from '../components/DepthVisualization'
import PerformanceCharts from '../components/PerformanceCharts'
import type { DepthFrame, MetricsData, GeminiDescription } from '../types'

const MAX_METRICS = 60
const MAX_GEMINI = 20
const CAPTURE_INTERVAL_MS = 150   // ~7 fps capture rate

export default function StatsPanel() {
  // /ws/stats — gemini descriptions + performance metrics
  const { lastMessage, status } = useWebSocket(wsUrl('/ws/stats'))

  const [depthFrame, setDepthFrame] = useState<DepthFrame | null>(null)
  const [metrics, setMetrics] = useState<MetricsData[]>([])
  const [geminiItems, setGeminiItems] = useState<GeminiDescription[]>([])
  const [lastFrame, setLastFrame] = useState<string | null>(null)
  // --- /ws/stats messages (metrics, gemini, frame, analysis) ---
  useEffect(() => {
    if (!lastMessage) return
    const msg = lastMessage as { type: string; data?: string; depth_frame?: string; min_distance?: number; inference_ms?: number; is_indoor?: boolean } & Record<string, unknown>

    if (msg.type === 'frame' && msg.data) {
      setLastFrame(msg.data)
    } else if (msg.type === 'analysis' && msg.depth_frame !== undefined) {
      setDepthFrame({
        data: msg.depth_frame as string,
        min_distance: msg.min_distance as number,
        inference_ms: msg.inference_ms as number,
        is_indoor: msg.is_indoor as boolean,
      })
    } else if (msg.type === 'metrics') {
      setMetrics((prev) => [...prev.slice(-MAX_METRICS + 1), msg as unknown as MetricsData])
    } else if (msg.type === 'gemini_description') {
      setGeminiItems((prev) => [
        ...prev.slice(-MAX_GEMINI + 1),
        msg as unknown as GeminiDescription,
      ])
    }
  }, [lastMessage])

  const isConnected = status === 'open'

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden font-mono">
      {/* Header */}
      <div className="bg-brutal-pink border-b-4 border-black px-4 py-2 flex items-center justify-between flex-shrink-0">
        <h1 className="text-black font-black uppercase text-lg">DIAGNOSTICS & STATS</h1>
        <div className="flex items-center gap-3">
          <span className={`tag-brutal ${isConnected ? 'bg-brutal-green text-black' : 'bg-brutal-red text-white'}`}>
            {isConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
          <a href="/" className="text-black text-xs underline font-bold">MENU</a>
        </div>
      </div>

      {/* 4-quadrant grid */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 overflow-hidden min-h-0">

        {/* Top-left: Video stream */}
        <div className="border-r-4 border-b-4 border-black overflow-hidden relative bg-black">
          <div className="absolute top-0 left-0 right-0 z-10 bg-black/80 px-3 py-1">
            <span className="text-brutal-yellow font-black uppercase text-xs">STREAM UŻYTKOWNIKA</span>
          </div>
          {lastFrame ? (
            <img
              src={`data:image/jpeg;base64,${lastFrame}`}
              alt="Stream użytkownika"
              className="w-full h-full object-contain pt-7"
            />
          ) : (
            <div className="w-full h-full pt-7 flex items-center justify-center">
              <span className="text-brutal-yellow font-black animate-pulse">Oczekiwanie…</span>
            </div>
          )}
        </div>

        {/* Top-right: Depth visualization */}
        <div className="border-b-4 border-black overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 z-10 bg-black/80 px-3 py-1">
            <span className="text-brutal-yellow font-black uppercase text-xs">DEPTH MAP — MODEL OUTPUT</span>
          </div>
          <div className="w-full h-full pt-7">
            <DepthVisualization frame={depthFrame} />
          </div>
        </div>

        {/* Bottom-left: Gemini live descriptions */}
        <div className="border-r-4 border-black overflow-hidden flex flex-col">
          <div className="bg-brutal-blue border-b-2 border-black px-3 py-1 flex-shrink-0">
            <span className="text-white font-black uppercase text-xs">GEMINI LIVE — OPISY RUCHU</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col-reverse gap-1">
            {geminiItems.length === 0 && (
              <span className="text-gray-400 text-xs font-bold uppercase">Oczekiwanie…</span>
            )}
            {[...geminiItems].reverse().map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-gray-400 text-xs flex-shrink-0">
                  {new Date(item.timestamp * 1000).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="text-black text-xs font-bold">{item.text}</span>
                <span className="text-gray-400 text-xs flex-shrink-0 ml-auto">{item.response_ms.toFixed(0)}ms</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom-right: Performance charts */}
        <div className="overflow-hidden flex flex-col">
          <div className="bg-brutal-orange border-b-2 border-black px-3 py-1 flex-shrink-0">
            <span className="text-white font-black uppercase text-xs">WYDAJNOŚĆ MODELU</span>
          </div>
          <div className="flex-1 min-h-0">
            <PerformanceCharts metrics={metrics} />
          </div>
        </div>

      </div>
    </div>
  )
}
