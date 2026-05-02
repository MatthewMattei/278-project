"use client";

import { addEventGuest } from "@/app/actions/events";
import { AvatarImg } from "@/components/AvatarImg";
import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";

type Friend = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

export function EventPrivateGuestPicker({
  eventId,
  myUserId,
  canInvite,
}: {
  eventId: string;
  myUserId: string;
  canInvite: boolean;
}) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: ships } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .eq("status", "accepted")
      .or(`requester_id.eq.${myUserId},addressee_id.eq.${myUserId}`);

    const otherIds = [
      ...new Set(
        (ships ?? []).map((f) =>
          f.requester_id === myUserId ? f.addressee_id : f.requester_id,
        ),
      ),
    ];

    const { data: mem } = await supabase
      .from("event_members")
      .select("user_id")
      .eq("event_id", eventId);

    setMemberIds(new Set((mem ?? []).map((m) => m.user_id)));

    if (!otherIds.length) {
      setFriends([]);
      return;
    }

    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", otherIds);

    setFriends(
      (profs ?? []).map((p) => ({
        id: p.id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
      })),
    );
  }, [eventId, myUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addGuest(friendId: string) {
    setBusyId(friendId);
    setMsg(null);
    try {
      const result = await addEventGuest(eventId, friendId);
      if (result.added === false) return;
      await load();
      setMsg("Added to event.");
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      if (raw.includes("already_started")) {
        setMsg("This event has already started, so invites are closed.");
      } else if (raw.includes("not_friends")) {
        setMsg("You can only invite people on your friends list.");
      } else if (raw.includes("forbidden")) {
        setMsg("You don’t have permission to invite people to this event.");
      } else {
        setMsg(raw || "Could not add");
      }
    } finally {
      setBusyId(null);
    }
  }

  if (!canInvite) return null;

  const available = friends.filter((f) => !memberIds.has(f.id));

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white/70 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/90 dark:text-emerald-300">
        Invite friends
      </p>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        Only people you&apos;re friends with can be added. They&apos;ll see this
        event in the app once added.
      </p>
      {msg ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{msg}</p>
      ) : null}
      <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
        {available.length === 0 ? (
          <li className="text-sm text-zinc-500">
            {friends.length === 0
              ? "Add friends from your profile first."
              : "Everyone you know is already in this event."}
          </li>
        ) : (
          available.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200/60 px-2 py-2 dark:border-zinc-700"
            >
              <span className="flex min-w-0 items-center gap-2">
                <AvatarImg src={f.avatar_url} alt={f.display_name} size={32} />
                <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  {f.display_name}
                </span>
              </span>
              <button
                type="button"
                disabled={busyId === f.id}
                onClick={() => void addGuest(f.id)}
                className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                {busyId === f.id ? "…" : "Add"}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
