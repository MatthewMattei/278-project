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
      className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
    >
      Accept
    </button>
  );
}
