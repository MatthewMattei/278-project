"use client";

import { createPin } from "@/app/actions/pins";
import { createClient } from "@/lib/supabase/client";
import { STANFORD_CENTER, STANFORD_MAP_ZOOM } from "@/lib/map/region";
import {
  CATEGORIES,
  type CategoryId,
  makeCategoryIcon,
} from "@/lib/map/categories";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { PinDetailPanel } from "@/components/PinDetailPanel";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

type PinRow = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  category: string;
};

type GeocodeResult = { lat: number; lng: number; label: string };

const DEFAULT_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

const DEFAULT_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Pre-built Leaflet icons for each category (keyed by category id). */
const categoryIcons: Record<string, L.DivIcon> = {};
function getCategoryIcon(categoryId: string): L.DivIcon {
  if (!categoryIcons[categoryId]) {
    categoryIcons[categoryId] = makeCategoryIcon(categoryId);
  }
  return categoryIcons[categoryId];
}

function titleFromGeocodeLabel(label: string): string {
  const first = label.split(",").map((s) => s.trim())[0];
  return first && first.length > 0 ? first : label.slice(0, 120);
}

function MapFlyTo({
  tick,
  lat,
  lng,
  zoom,
}: {
  tick: number;
  lat: number | null;
  lng: number | null;
  zoom: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (tick === 0 || lat == null || lng == null) return;
    map.flyTo([lat, lng], zoom, { duration: 0.85 });
  }, [tick, lat, lng, zoom, map]);
  return null;
}

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
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [title, setTitle] = useState("");
  const [draftCategory, setDraftCategory] = useState<CategoryId>("other");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Categories that are currently visible on the map (all on by default)
  const [activeCategories, setActiveCategories] = useState<Set<CategoryId>>(
    () => new Set(CATEGORIES.map((c) => c.id)),
  );

  function toggleCategory(id: CategoryId) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [flyTick, setFlyTick] = useState(0);
  const [flyLat, setFlyLat] = useState<number | null>(null);
  const [flyLng, setFlyLng] = useState<number | null>(null);
  const [flyZoom, setFlyZoom] = useState(17);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);

  const tileUrl =
    process.env.NEXT_PUBLIC_MAP_TILE_URL?.trim() || DEFAULT_TILE_URL;
  const attribution =
    process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION?.trim() || DEFAULT_ATTRIBUTION;
  const subdomains =
    process.env.NEXT_PUBLIC_MAP_TILE_SUBDOMAINS?.trim() || "abcd";

  const loadPins = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("pins")
      .select("id, lat, lng, title, category")
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

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const el = searchWrapRef.current;
      if (!el || !searchOpen) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [searchOpen]);

  const onMapClick = useCallback((lat: number, lng: number) => {
    setDraft({ lat, lng });
    setTitle("");
    setDraftCategory("other");
    setErr(null);
    setSearchOpen(false);
  }, []);

  async function runPlaceSearch() {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchError("Type at least 2 characters.");
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    setSearchResults([]);
    try {
      const res = await fetch(`/api/places/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as {
        error?: string;
        results?: GeocodeResult[];
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Search failed");
      }
      const list = data.results ?? [];
      setSearchResults(list);
      setSearchOpen(true);
      if (list.length === 0) {
        setSearchError("No matches. Try a different name or address.");
      }
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Search failed");
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  function selectGeocodeResult(r: GeocodeResult) {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchError(null);
    setDraft({ lat: r.lat, lng: r.lng });
    setTitle(titleFromGeocodeLabel(r.label));
    setErr(null);
    setFlyLat(r.lat);
    setFlyLng(r.lng);
    setFlyZoom(17);
    setFlyTick((t) => t + 1);
  }

  async function savePin() {
    if (!draft || !title.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const id = await createPin(
        draft.lat,
        draft.lng,
        title.trim(),
        draftCategory,
      );
      setDraft(null);
      setTitle("");
      setDraftCategory("other");
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
          center={[STANFORD_CENTER.lat, STANFORD_CENTER.lng]}
          zoom={STANFORD_MAP_ZOOM}
          scrollWheelZoom
          className="z-0 h-full w-full min-h-[320px] [&_.leaflet-control-attribution]:text-[10px]"
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution={attribution}
            url={tileUrl}
            subdomains={subdomains}
          />
          <MapFlyTo tick={flyTick} lat={flyLat} lng={flyLng} zoom={flyZoom} />
          <MapClickHandler onClick={onMapClick} />
          {pins
            .filter((p) =>
              activeCategories.has((p.category ?? "other") as CategoryId),
            )
            .map((p) => (
              <Marker
                key={p.id}
                position={[p.lat, p.lng]}
                icon={getCategoryIcon(p.category ?? "other")}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e.originalEvent);
                    openPin(p.id);
                  },
                }}
              />
            ))}
        </MapContainer>

        <div
          ref={searchWrapRef}
          className="pointer-events-auto absolute left-1/2 top-3 z-[1000] w-[min(100%-1.5rem,28rem)] -translate-x-1/2"
        >
          <div className="rounded-2xl border border-white/40 bg-white/95 p-2 shadow-[0_12px_40px_rgba(15,23,42,0.18)] backdrop-blur-md dark:border-zinc-600 dark:bg-zinc-900/95">
            <label className="sr-only" htmlFor="place-search">
              Search place or address
            </label>
            <div className="flex gap-2">
              <input
                id="place-search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runPlaceSearch();
                  }
                }}
                placeholder="Search name or address ..."
                autoComplete="off"
                className="min-w-0 flex-1 rounded-xl border border-zinc-200/90 bg-white/80 px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-100"
              />
              <button
                type="button"
                disabled={searchLoading}
                onClick={() => void runPlaceSearch()}
                className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {searchLoading ? "…" : "Search"}
              </button>
            </div>
            {searchError ? (
              <p className="mt-2 px-1 text-xs text-red-600 dark:text-red-400">
                {searchError}
              </p>
            ) : null}
            <p className="mt-1.5 px-1 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
              Geocoding ©{" "}
              <a
                className="underline decoration-zinc-400/80 underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
              >
                OpenStreetMap
              </a>{" "}
              contributors (
              <a
                className="underline decoration-zinc-400/80 underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
                href="https://nominatim.org"
                target="_blank"
                rel="noreferrer"
              >
                Nominatim
              </a>
              ).
            </p>
            {searchOpen && searchResults.length > 0 ? (
              <ul className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-zinc-200/80 bg-white/90 dark:border-zinc-600 dark:bg-zinc-900/90">
                {searchResults.map((r, i) => (
                  <li
                    key={`${r.lat},${r.lng},${i}`}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-700/80"
                  >
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-xs leading-snug text-zinc-800 hover:bg-emerald-50 dark:text-zinc-100 dark:hover:bg-emerald-950/40"
                      onClick={() => selectGeocodeResult(r)}
                    >
                      {r.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        {/* Category filter legend — bottom-left */}
        <div className="pointer-events-auto absolute bottom-6 left-3 z-[1000]">
          <div className="rounded-2xl border border-white/40 bg-white/95 p-3 shadow-[0_8px_32px_rgba(15,23,42,0.18)] backdrop-blur-md dark:border-zinc-600 dark:bg-zinc-900/95">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Filter
            </p>
            <ul className="flex flex-col gap-1.5">
              {CATEGORIES.map((cat) => {
                const active = activeCategories.has(cat.id);
                return (
                  <li key={cat.id}>
                    <button
                      type="button"
                      onClick={() => toggleCategory(cat.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs font-medium transition ${
                        active
                          ? "text-zinc-900 dark:text-zinc-50"
                          : "text-zinc-400 line-through dark:text-zinc-600"
                      }`}
                    >
                      <span
                        className="inline-block h-3 w-3 shrink-0 rounded-full border border-white/80 shadow-sm"
                        style={{
                          backgroundColor: active ? cat.color : "#d1d5db",
                        }}
                      />
                      <span>{cat.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

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
            {/* Category picker */}
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                Category
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setDraftCategory(cat.id)}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      draftCategory === cat.id
                        ? "border-transparent text-white shadow-sm"
                        : "border-zinc-200/90 bg-white/70 text-zinc-600 hover:border-zinc-300 dark:border-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300"
                    }`}
                    style={
                      draftCategory === cat.id
                        ? { backgroundColor: cat.color }
                        : {}
                    }
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
            {err ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {err}
              </p>
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
          Search for a place, or tap the map to drop a pin. Tap a marker to open
          this place — upcoming events and group reviews live in the panel on
          the right.
        </p>
      </div>
    </div>
  );
}
