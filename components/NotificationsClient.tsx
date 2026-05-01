"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Row = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export function NotificationsClient({
  initialRows,
  userId,
  markRead,
}: {
  initialRows: Row[];
  userId: string;
  markRead: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`notif:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as Row;
          setRows((prev) => [n, ...prev]);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId]);

  async function onMarkRead(id: string) {
    await markRead(id);
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, read_at: new Date().toISOString() } : r,
      ),
    );
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <p className="mt-8 text-sm text-zinc-500">
        You&apos;re all caught up. When friends publish reviews, you&apos;ll
        see them here.
      </p>
    );
  }

  return (
    <ul className="mt-6 space-y-3">
      {rows.map((r) => (
        <li
          key={r.id}
          className={`rounded-xl border p-4 dark:border-zinc-800 ${
            r.read_at
              ? "border-zinc-100 bg-zinc-50/50 dark:bg-zinc-900/40"
              : "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/30"
          }`}
        >
          <div className="text-xs uppercase text-zinc-500">{r.type}</div>
          {r.type === "friend_review" &&
          typeof r.payload.pin_id === "string" ? (
            <Link
              href={`/pins/${r.payload.pin_id}`}
              className="mt-1 block font-medium text-emerald-800 hover:underline dark:text-emerald-300"
            >
              A friend posted a review — view pin
            </Link>
          ) : (
            <pre className="mt-2 max-h-40 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">
              {JSON.stringify(r.payload, null, 2)}
            </pre>
          )}
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-zinc-500">
            <span>{new Date(r.created_at).toLocaleString()}</span>
            {!r.read_at ? (
              <button
                type="button"
                onClick={() => void onMarkRead(r.id)}
                className="font-medium text-emerald-700 dark:text-emerald-400"
              >
                Mark read
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
