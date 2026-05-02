"use client";

import { sendFriendRequest } from "@/app/actions/social";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

type Profile = { id: string; display_name: string; friend_code: string };

export function FriendSearch({ currentUserId }: { currentUserId: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function search() {
    setBusy(true);
    setMsg(null);
    const code = q.trim().toLowerCase();
    if (!code) {
      setBusy(false);
      setResults([]);
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, friend_code")
      .neq("id", currentUserId)
      .eq("friend_code", code)
      .limit(5);
    setBusy(false);
    if (error) {
      setMsg(error.message);
      setResults([]);
      return;
    }
    const rows = (data ?? []) as Profile[];
    setResults(rows);
    if (rows.length === 0) {
      setMsg("No user found with that friend code.");
    }
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
    <div className="space-y-4 rounded-3xl border border-white/35 bg-white/92 p-5 shadow-[0_24px_64px_rgba(15,23,42,0.12)] backdrop-blur-md dark:border-zinc-600 dark:bg-zinc-900/82">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/95 dark:text-emerald-300">
        Add a friend
      </p>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Enter their friend code"
          className="flex-1 rounded-xl border border-zinc-200/90 bg-white/70 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900/50"
        />
        <button
          type="button"
          disabled={busy || !q.trim()}
          onClick={() => void search()}
          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          Look up
        </button>
      </div>
      {msg ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{msg}</p> : null}
      <ul className="space-y-2">
        {results.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-900"
          >
            <span>
              {p.display_name}{" "}
              <span className="text-xs font-normal text-zinc-500">
                ({p.friend_code})
              </span>
            </span>
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
