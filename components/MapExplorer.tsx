"use client";

import { createPin } from "@/app/actions/pins";
import { createClient } from "@/lib/supabase/client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { PinDetailPanel } from "@/components/PinDetailPanel";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMapEvents,
} from "react-leaflet";

type PinRow = {
  id: string;
  lat: number;
  lng: number;
  title: string;
};

const defaultCenter = { lat: 37.7749, lng: -122.4194 };

const DEFAULT_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

const DEFAULT_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Leaflet default icons break under bundlers; use CDN assets. */
const markerIcon = L.icon({
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function MapClickHandler({
  onClick,
}: {
  onClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapExplorer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPinId = searchParams.get("pin");

  function closePinPanel() {
    router.replace("/map", { scroll: false });
  }

  function openPin(id: string) {
    router.replace(`/map?pin=${encodeURIComponent(id)}`, { scroll: false });
  }
  const [pins, setPins] = useState<PinRow[]>([]);
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const tileUrl =
    process.env.NEXT_PUBLIC_MAP_TILE_URL?.trim() || DEFAULT_TILE_URL;
  const attribution =
    process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION?.trim() ||
    DEFAULT_ATTRIBUTION;
  const subdomains =
    process.env.NEXT_PUBLIC_MAP_TILE_SUBDOMAINS?.trim() || "abcd";

  const loadPins = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("pins")
      .select("id, lat, lng, title")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      setErr(error.message);
      return;
    }
    setPins((data ?? []) as PinRow[]);
  }, []);

  useEffect(() => {
    void loadPins();
  }, [loadPins]);

  const onMapClick = useCallback((lat: number, lng: number) => {
    setDraft({ lat, lng });
    setTitle("");
    setErr(null);
  }, []);

  async function savePin() {
    if (!draft || !title.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const id = await createPin(draft.lat, draft.lng, title.trim());
      setDraft(null);
      setTitle("");
      await loadPins();
      openPin(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save pin");
    } finally {
      setSaving(false);
    }
  }

  const mapKey = useMemo(
    () => `${tileUrl}|${subdomains}`,
    [tileUrl, subdomains],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <MapContainer
          key={mapKey}
          center={[defaultCenter.lat, defaultCenter.lng]}
          zoom={12}
          scrollWheelZoom
          className="z-0 h-full w-full min-h-[320px] [&_.leaflet-control-attribution]:text-[10px]"
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution={attribution}
            url={tileUrl}
            subdomains={subdomains}
          />
          <MapClickHandler onClick={onMapClick} />
          {pins.map((p) => (
            <Marker
              key={p.id}
              position={[p.lat, p.lng]}
              icon={markerIcon}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e.originalEvent);
                  openPin(p.id);
                },
              }}
            />
          ))}
        </MapContainer>

        {draft ? (
          <div className="absolute bottom-6 left-1/2 z-[1000] w-[min(100%-2rem,420px)] -translate-x-1/2 rounded-3xl border border-white/35 bg-white/95 p-4 shadow-[0_24px_64px_rgba(15,23,42,0.28)] backdrop-blur-md dark:border-zinc-600 dark:bg-zinc-900/92">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
              New pin
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
            </p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Place name"
              className="mt-3 w-full rounded-xl border border-zinc-200/90 bg-white/70 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50"
            />
            {err ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={saving || !title.trim()}
                onClick={() => void savePin()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save pin"}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-xl border border-zinc-200/90 bg-white/70 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {selectedPinId ? (
          <PinDetailPanel
            pinId={selectedPinId}
            onClose={closePinPanel}
            onPinsChanged={() => void loadPins()}
          />
        ) : null}
      </div>

      <div className="shrink-0 border-t border-zinc-200/80 bg-white/90 px-4 py-3 backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/90">
        <p className="text-center text-sm text-zinc-700 dark:text-zinc-300">
          Tap the map to drop a pin. Tap a marker to open this place — upcoming
          events and group reviews live in the panel on the right.
        </p>
      </div>
    </div>
  );
}
