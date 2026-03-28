import React from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { MetricsData } from '../types'

interface PerformanceChartsProps {
  metrics: MetricsData[]
}

const PerformanceCharts: React.FC<PerformanceChartsProps> = ({ metrics }) => {
  const last = metrics[metrics.length - 1]

  return (
    <div className="w-full h-full flex flex-col p-2 gap-2">
      {/* Stats strip */}
      <div className="flex gap-2 flex-wrap">
        {last && (
          <>
            <Stat label="DEPTH MS" value={`${last.depth_ms.toFixed(0)}`} color="bg-brutal-blue text-white" />
            <Stat label="FPS" value={`${last.fps.toFixed(1)}`} color="bg-brutal-green text-black" />
            <Stat label="FRAMES" value={`${last.frame_count}`} color="bg-brutal-yellow text-black" />
            <Stat label={last.is_indoor ? 'INDOOR' : 'OUTDOOR'} value={`${last.min_distance.toFixed(1)}m`} color="bg-brutal-red text-white" />
          </>
        )}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={metrics} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="frame_count" tick={{ fontSize: 10, fill: '#888' }} interval="preserveStartEnd" stroke="#555" />
            <YAxis tick={{ fontSize: 10, fill: '#888' }} stroke="#555" />
            <Tooltip
              contentStyle={{
                border: '2px solid #FFE500',
                background: '#1a1a2e',
                fontFamily: 'monospace',
                fontSize: 11,
                color: '#fff',
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#aaa' }} />
            <Line
              type="monotone"
              dataKey="depth_ms"
              stroke="#0066FF"
              strokeWidth={2}
              dot={false}
              name="Depth (ms)"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="fps"
              stroke="#00CC44"
              strokeWidth={2}
              dot={false}
              name="FPS"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`border-2 border-black px-2 py-0.5 font-bold text-xs ${color}`}>
      <span className="opacity-70">{label}: </span>
      <span>{value}</span>
    </div>
  )
}

export default PerformanceCharts
