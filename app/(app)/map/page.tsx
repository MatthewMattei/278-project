"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const MapExplorer = dynamic(() => import("@/components/MapExplorer"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[420px] flex-1 items-center justify-center bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
      Loading map…
    </div>
  ),
});

export default function MapPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense
        fallback={
          <div className="flex min-h-[420px] flex-1 items-center justify-center bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            Loading map…
          </div>
        }
      >
        <MapExplorer />
      </Suspense>
    </div>
  );
}
