"use client";

import { useState } from "react";

export function FriendCodeCopy({ code }: { code: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded-xl border border-zinc-200/90 bg-white/70 px-3 py-2 text-sm font-medium tracking-wide text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-100">
        {code}
      </code>
      <button
        type="button"
        onClick={() => void copy()}
        className="rounded-xl border border-zinc-200/90 bg-white/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-800 hover:bg-emerald-50 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
      >
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
