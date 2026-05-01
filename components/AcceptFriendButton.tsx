"use client";

import { acceptFriendship } from "@/app/actions/social";
import { useState } from "react";

export function AcceptFriendButton({ friendshipId }: { friendshipId: string }) {
  const [done, setDone] = useState(false);

  async function onAccept() {
    await acceptFriendship(friendshipId);
    setDone(true);
  }

  if (done) {
    return (
      <span className="text-sm text-emerald-600 dark:text-emerald-400">
        Accepted
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void onAccept()}
      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700"
    >
      Accept
    </button>
  );
}
