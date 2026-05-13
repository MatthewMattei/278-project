/** Stanford main campus (Main Quad area). */
export const STANFORD_CENTER = { lat: 37.4275, lng: -122.1697 } as const;

/** Default zoom for the interactive pins map (campus scale). */
export const STANFORD_MAP_ZOOM = 16;

/** Slightly wider framing for the static login backdrop map. */
export const STANFORD_AUTH_MAP_ZOOM = 15;

/**
 * Nominatim `viewbox=left,top,right,bottom` (west, north, east, south) to bias
 * search results toward Stanford / adjacent Palo Alto–Menlo Park.
 */
export const STANFORD_SEARCH_VIEWBOX =
  "-122.205,37.455,-122.115,37.405" as const;
