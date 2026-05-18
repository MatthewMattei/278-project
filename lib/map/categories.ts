import L from "leaflet";

export const CATEGORIES = [
  { id: "food", label: "Food & Drink", color: "#f97316" },
  { id: "outdoors", label: "Outdoors", color: "#22c55e" },
  { id: "arts", label: "Arts & Culture", color: "#a855f7" },
  { id: "sports", label: "Sports", color: "#3b82f6" },
  { id: "social", label: "Social", color: "#ec4899" },
  { id: "other", label: "Other", color: "#94a3b8" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<CategoryId, (typeof CATEGORIES)[number]>;

/** Builds a colored SVG drop-pin Leaflet icon for a given category. */
export function makeCategoryIcon(categoryId: string): L.DivIcon {
  const cat = CATEGORY_MAP[categoryId as CategoryId] ?? CATEGORY_MAP.other;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="38" viewBox="0 0 26 38">
    <path d="M13 0C5.82 0 0 5.82 0 13c0 9.75 13 25 13 25S26 22.75 26 13C26 5.82 20.18 0 13 0z" fill="${cat.color}" stroke="white" stroke-width="1.5"/>
    <circle cx="13" cy="13" r="5.5" fill="white" opacity="0.92"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    iconSize: [26, 38],
    iconAnchor: [13, 38],
    popupAnchor: [0, -38],
    className: "",
  });
}
