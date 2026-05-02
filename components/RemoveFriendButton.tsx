"use client";

import { removeFriendship } from "@/app/actions/social";
import { useState } from "react";

export function RemoveFriendButton({ friendshipId }: { friendshipId: string }) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm("Remove this friend?")) return;
    setBusy(true);
    try {
      await removeFriendship(friendshipId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void remove()}
      className="rounded-xl border border-zinc-200/90 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
    >
      {busy ? "…" : "Remove"}
    </button>
  );
}
