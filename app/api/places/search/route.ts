import { STANFORD_SEARCH_VIEWBOX } from "@/lib/map/region";
import { NextRequest, NextResponse } from "next/server";

type NominatimHit = {
  lat: string;
  lon: string;
  display_name: string;
};

/**
 * Proxy to OpenStreetMap Nominatim (geocoding). See usage policy:
 * https://operations.osmfoundation.org/policies/nominatim/
 *
 * Set NOMINATIM_USER_AGENT in .env.local to a string that identifies your app
 * and includes contact info (email or URL), per OSM guidelines.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json(
      { error: "Enter at least 2 characters to search." },
      { status: 400 },
    );
  }

  const ua =
    process.env.NOMINATIM_USER_AGENT?.trim() ||
    "PinTogether/0.1 (local dev; add NOMINATIM_USER_AGENT in .env.local per https://operations.osmfoundation.org/policies/nominatim/)";

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "8");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("viewbox", STANFORD_SEARCH_VIEWBOX);
  url.searchParams.set("bounded", "0");
  url.searchParams.set("addressdetails", "0");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": ua,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Geocoder returned ${res.status}. Try again in a moment.` },
        { status: 502 },
      );
    }

    const raw = (await res.json()) as NominatimHit[];
    const results = (Array.isArray(raw) ? raw : []).map((row) => ({
      lat: Number.parseFloat(row.lat),
      lng: Number.parseFloat(row.lon),
      label: row.display_name,
    }));

    const filtered = results.filter(
      (r) => Number.isFinite(r.lat) && Number.isFinite(r.lng) && r.label,
    );

    return NextResponse.json({ results: filtered });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the geocoder. Check your network connection." },
      { status: 503 },
    );
  }
}
