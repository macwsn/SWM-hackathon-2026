import { useEffect, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { wsUrl } from '../lib/wsUrl'
import DepthVisualization from '../components/DepthVisualization'
import PerformanceCharts from '../components/PerformanceCharts'
import type { DepthFrame, MetricsData, GeminiDescription } from '../types'

const MAX_METRICS = 60
const MAX_GEMINI = 20

export default function StatsPanel() {
  const { lastMessage, status } = useWebSocket(wsUrl('/ws/stats'))

  const [depthFrame, setDepthFrame] = useState<DepthFrame | null>(null)
  const [metrics, setMetrics] = useState<MetricsData[]>([])
  const [geminiItems, setGeminiItems] = useState<GeminiDescription[]>([])
  const [lastFrame, setLastFrame] = useState<string | null>(null)

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
    <div className="h-screen bg-brutal-darker flex flex-col overflow-hidden font-mono">
      {/* Header */}
      <div className="bg-[#FF66CC] border-b-4 border-black px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📊</span>
          <h1 className="text-black font-black uppercase text-lg">DIAGNOSTICS & STATS</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className={`tag-brutal ${isConnected ? 'bg-brutal-green text-black' : 'bg-brutal-red text-white'}`}>
            <span className="inline-flex items-center gap-1">
              <span className={`inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-black' : 'bg-white animate-blink'}`} />
              {isConnected ? 'ONLINE' : 'OFFLINE'}
            </span>
          </span>
          <a href="/" className="text-black text-xs underline font-bold hover:text-white transition-colors">MENU</a>
        </div>
      </div>

      {/* 4-quadrant grid */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 overflow-hidden min-h-0">

        {/* Top-left: Video stream */}
        <div className="border-r-4 border-b-4 border-black overflow-hidden relative bg-black scanlines">
          <div className="absolute top-0 left-0 right-0 z-10 bg-black/80 px-3 py-1.5 flex items-center gap-2 border-b border-brutal-yellow/30">
            <span className="inline-block w-2 h-2 rounded-full bg-brutal-red animate-pulse" />
            <span className="text-brutal-yellow font-black uppercase text-xs">USER STREAM</span>
            {lastFrame && <span className="ml-auto text-brutal-red text-xs font-black">● LIVE</span>}
          </div>
          {lastFrame ? (
            <img
              src={`data:image/jpeg;base64,${lastFrame}`}
              alt="User stream"
              className="w-full h-full object-contain pt-8"
            />
          ) : (
            <div className="w-full h-full pt-8 flex items-center justify-center bg-grid-light">
              <div className="text-center">
                <span className="text-4xl block mb-2">📷</span>
                <span className="text-brutal-yellow font-black animate-pulse text-sm">Waiting…</span>
              </div>
            </div>
          )}
        </div>

        {/* Top-right: Depth visualization */}
        <div className="border-b-4 border-black overflow-hidden relative scanlines">
          <div className="absolute top-0 left-0 right-0 z-10 bg-black/80 px-3 py-1.5 flex items-center gap-2 border-b border-brutal-yellow/30">
            <span className="text-sm">🌊</span>
            <span className="text-brutal-yellow font-black uppercase text-xs">DEPTH MAP — MODEL OUTPUT</span>
            {depthFrame && (
              <span className="ml-auto text-brutal-green text-xs font-bold">{depthFrame.inference_ms.toFixed(0)}ms</span>
            )}
          </div>
          <div className="w-full h-full pt-8">
            <DepthVisualization frame={depthFrame} />
          </div>
        </div>

        {/* Bottom-left: Gemini live descriptions */}
        <div className="border-r-4 border-black overflow-hidden flex flex-col bg-[#1a1a2e]">
          <div className="bg-[#0066FF] border-b-2 border-black px-3 py-1.5 flex-shrink-0 flex items-center gap-2">
            <span className="text-sm">🤖</span>
            <span className="text-white font-black uppercase text-xs">GEMINI LIVE — MOTION DESCRIPTIONS</span>
            <span className="ml-auto bg-black/40 text-white text-xs font-bold px-1.5 py-0.5 rounded">{geminiItems.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col-reverse gap-1.5 bg-[#1a1a2e] bg-grid-light">
            {geminiItems.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <span className="text-gray-500 text-xs font-bold uppercase animate-pulse">Waiting for descriptions…</span>
              </div>
            )}
            {[...geminiItems].reverse().map((item, i) => (
              <div key={i} className={`flex flex-col gap-0.5 p-2 border border-white/10 ${i === 0 ? 'bg-brutal-blue/20 border-l-4 border-l-brutal-blue' : 'bg-white/5'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-xs flex-shrink-0">
                    {new Date(item.timestamp * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className={`text-xs font-black flex-shrink-0 ml-auto px-1.5 py-0.5 border border-black/20 ${
                    item.response_ms < 500 ? 'bg-brutal-green/20 text-brutal-green' :
                    item.response_ms < 1500 ? 'bg-brutal-yellow/20 text-brutal-yellow' :
                    'bg-brutal-red/20 text-brutal-red'
                  }`}>
                    {item.response_ms.toFixed(0)}ms
                  </span>
                </div>
                <span className="text-white font-bold leading-snug">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom-right: Performance charts */}
        <div className="overflow-hidden flex flex-col bg-[#1a1a2e]">
          <div className="bg-[#FF6600] border-b-2 border-black px-3 py-1.5 flex-shrink-0 flex items-center gap-2">
            <span className="text-sm">⚡</span>
            <span className="text-white font-black uppercase text-xs">MODEL PERFORMANCE</span>
          </div>
          <div className="flex-1 min-h-0">
            <PerformanceCharts metrics={metrics} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 bg-black border-t-4 border-brutal-pink px-4 py-1 flex items-center justify-between">
        <a href="/" className="text-brutal-pink font-bold text-xs uppercase underline">← MENU</a>
        <span className="text-brutal-pink/50 text-xs font-bold">AISIGHT — DIAGNOSTICS</span>
      </div>
    </div>
  )
}
