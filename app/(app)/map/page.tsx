import { MapExplorer } from "@/components/MapExplorer";

export default function MapPage() {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Map</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Set{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
            NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
          </code>{" "}
          in{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
            .env.local
          </code>{" "}
          to load Google Maps.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <MapExplorer apiKey={key} />
    </div>
  );
}
