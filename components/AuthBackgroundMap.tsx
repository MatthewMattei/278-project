"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer } from "react-leaflet";

const defaultCenter = { lat: 37.7749, lng: -122.4194 };
const DEFAULT_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const DEFAULT_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export default function AuthBackgroundMap() {
  const tileUrl =
    process.env.NEXT_PUBLIC_MAP_TILE_URL?.trim() || DEFAULT_TILE_URL;
  const attribution =
    process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION?.trim() ||
    DEFAULT_ATTRIBUTION;
  const subdomains =
    process.env.NEXT_PUBLIC_MAP_TILE_SUBDOMAINS?.trim() || "abcd";

  return (
    <MapContainer
      center={[defaultCenter.lat, defaultCenter.lng]}
      zoom={11}
      className="h-full w-full [&_.leaflet-pane]:!z-0 [&_.leaflet-top]:hidden [&_.leaflet-bottom]:hidden"
      zoomControl={false}
      attributionControl={false}
      dragging={false}
      doubleClickZoom={false}
      scrollWheelZoom={false}
      touchZoom={false}
      keyboard={false}
      boxZoom={false}
    >
      <TileLayer attribution={attribution} url={tileUrl} subdomains={subdomains} />
    </MapContainer>
  );
}
