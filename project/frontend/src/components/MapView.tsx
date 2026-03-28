import React, { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { LocationData } from '../types'

// Fix default marker icon (Vite asset issue)
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const userIcon = L.divIcon({
  html: `<div style="
    width:20px;height:20px;
    background:#FF3333;
    border:3px solid #000;
    border-radius:50%;
    box-shadow: 3px 3px 0 #000;
  "></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  className: '',
})

function MapRecenter({ location }: { location: LocationData }) {
  const map = useMap()
  useEffect(() => {
    map.setView([location.lat, location.lon], map.getZoom(), { animate: true })
  }, [location, map])
  return null
}

interface MapViewProps {
  location: LocationData | null
  trail: LocationData[]
}

const DEFAULT_POSITION: [number, number] = [50.0614, 19.9366] // Kraków center

const MapView: React.FC<MapViewProps> = ({ location, trail }) => {
  const center = location
    ? ([location.lat, location.lon] as [number, number])
    : DEFAULT_POSITION

  const trailPositions = trail.map((p) => [p.lat, p.lon] as [number, number])

  return (
    <MapContainer
      center={center}
      zoom={17}
      className="w-full h-full"
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {location && (
        <>
          <Marker position={[location.lat, location.lon]} icon={userIcon} />
          <MapRecenter location={location} />
        </>
      )}
      {trailPositions.length > 1 && (
        <Polyline
          positions={trailPositions}
          pathOptions={{ color: '#FF3333', weight: 3, opacity: 0.7 }}
        />
      )}
    </MapContainer>
  )
}

export default MapView
