'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type MapStop = {
  stop_id: string;
  stop_name: string;
  route_name?: string;
  latitude: number;
  longitude: number;
  fee_amount?: number;
  distance_km?: number;
  selected?: boolean;
};

export type BusLocation = {
  lat: number;
  lng: number;
  speed?: number;
};

const stopIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const busIcon = new L.DivIcon({
  className: '',
  html: `<div style="background:#f59e0b;border:2px solid #1e3a5f;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px">🚌</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export function TransportMap({
  center,
  stops,
  busLocation,
  homeLocation,
  onSelectStop,
  height = 360,
}: {
  center: [number, number];
  stops: MapStop[];
  busLocation?: BusLocation | null;
  homeLocation?: [number, number] | null;
  onSelectStop?: (stop: MapStop) => void;
  height?: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-sgvu-gold/30" style={{ height }}>
      <MapContainer center={center} zoom={12} scrollWheelZoom className="h-full w-full">
        <Recenter center={center} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {homeLocation && (
          <CircleMarker center={homeLocation} radius={10} pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.8 }}>
            <Popup>Your location</Popup>
          </CircleMarker>
        )}
        {stops.map((stop) => (
          <Marker
            key={stop.stop_id}
            position={[stop.latitude, stop.longitude]}
            icon={stopIcon}
            eventHandlers={{
              click: () => onSelectStop?.(stop),
            }}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-bold">{stop.stop_name}</p>
                {stop.route_name && <p className="text-gray-600">{stop.route_name}</p>}
                {stop.fee_amount != null && <p>₹{stop.fee_amount.toLocaleString()}/sem</p>}
                {stop.distance_km != null && <p>{stop.distance_km.toFixed(1)} km away</p>}
              </div>
            </Popup>
          </Marker>
        ))}
        {busLocation && (
          <Marker position={[busLocation.lat, busLocation.lng]} icon={busIcon}>
            <Popup>Live bus{busLocation.speed ? ` · ${busLocation.speed} km/h` : ''}</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
