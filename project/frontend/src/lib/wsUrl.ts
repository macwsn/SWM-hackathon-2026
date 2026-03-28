/** Returns a WebSocket URL that goes through the Vite dev-server proxy (or production server). */
export function wsUrl(path: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}${path}`
}
