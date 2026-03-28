export interface AlertMessage {
  id: string
  type: 'alert' | 'describe_response' | 'system'
  text: string
  distance?: number
  is_indoor?: boolean
  timestamp: number
}

export interface LocationData {
  lat: number
  lon: number
  speed?: number
  heading?: number
  timestamp?: number
}

export interface DepthFrame {
  data: string        // base64 JPEG
  min_distance: number
  inference_ms: number
  is_indoor: boolean
}

export interface MetricsData {
  depth_ms: number
  fps: number
  frame_count: number
  is_indoor: boolean
  min_distance: number
  timestamp: number
}

export interface GeminiDescription {
  text: string
  response_ms: number
  timestamp: number
}
