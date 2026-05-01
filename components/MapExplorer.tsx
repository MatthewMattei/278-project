"use client";

import { createPin } from "@/app/actions/pins";
import { createClient } from "@/lib/supabase/client";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import type { ComponentProps } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type PinRow = {
  id: string;
  lat: number;
  lng: number;
  title: string;
};

const defaultCenter = { lat: 37.7749, lng: -122.4194 };

export function MapExplorer({ apiKey }: { apiKey: string }) {
  const router = useRouter();
  const [pins, setPins] = useState<PinRow[]>([]);
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  const onMapClick: NonNullable<ComponentProps<typeof Map>["onClick"]> = (
    e,
  ) => {
    const latLng = e.detail.latLng;
    if (!latLng) return;
    setDraft({ lat: latLng.lat, lng: latLng.lng });
    setTitle("");
    setErr(null);
  };

  async function savePin() {
    if (!draft || !title.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const id = await createPin(draft.lat, draft.lng, title.trim());
      setDraft(null);
      setTitle("");
      await loadPins();
      router.push(`/pins/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save pin");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative h-[calc(100vh-8rem)] w-full min-h-[420px]">
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={defaultCenter}
          defaultZoom={12}
          gestureHandling="greedy"
          disableDefaultUI={false}
          onClick={onMapClick}
          className="h-full w-full"
        >
          {pins.map((p) => (
            <Marker
              key={p.id}
              position={{ lat: p.lat, lng: p.lng }}
              onClick={() => router.push(`/pins/${p.id}`)}
            />
          ))}
        </Map>
      </APIProvider>

      <div className="pointer-events-none absolute left-3 top-3 max-w-sm rounded-lg bg-white/95 p-3 text-sm shadow-md dark:bg-zinc-900/95">
        <p className="pointer-events-auto text-zinc-700 dark:text-zinc-300">
          Tap the map to drop a pin. Tap a marker to open the place.
        </p>
        <Link
          href="/guidelines"
          className="pointer-events-auto mt-2 inline-block text-emerald-700 underline dark:text-emerald-400"
        >
          Community guidelines
        </Link>
      </div>

      {draft ? (
        <div className="absolute bottom-6 left-1/2 z-10 w-[min(100%-2rem,420px)] -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
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
            className="mt-3 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
          />
          {err ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={saving || !title.trim()}
              onClick={() => void savePin()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save pin"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
