"use client";

import { sendFriendRequest } from "@/app/actions/social";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

type Profile = { id: string; display_name: string };

export function FriendSearch({ currentUserId }: { currentUserId: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function search() {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name")
      .neq("id", currentUserId)
      .ilike("display_name", `%${q}%`)
      .limit(12);
    setBusy(false);
    if (error) {
      setMsg(error.message);
      setResults([]);
      return;
    }
    setResults((data ?? []) as Profile[]);
  }

  async function request(targetUserId: string) {
    setMsg(null);
    try {
      await sendFriendRequest(targetUserId);
      setMsg("Request sent.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search display name…"
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
        />
        <button
          type="button"
          disabled={busy || !q.trim()}
          onClick={() => void search()}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-200 dark:text-zinc-900"
        >
          Search
        </button>
      </div>
      {msg ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{msg}</p> : null}
      <ul className="space-y-2">
        {results.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-900"
          >
            <span>{p.display_name}</span>
            <button
              type="button"
              onClick={() => void request(p.id)}
              className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Add friend
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
