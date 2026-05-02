"use client";

import { createEvent } from "@/app/actions/events";
import { NormReminder } from "@/components/NormReminder";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateEventForm({
  pinId,
  onSuccess,
  defaultCollapsed = false,
}: {
  pinId: string;
  onSuccess?: (eventId: string) => void;
  defaultCollapsed?: boolean;
}) {
  const router = useRouter();
  const [startsAt, setStartsAt] = useState("");
  const [capacity, setCapacity] = useState(8);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [membersCanInviteFriends, setMembersCanInviteFriends] = useState(false);
  const [blurb, setBlurb] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!defaultCollapsed);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const iso = new Date(startsAt).toISOString();
      const ev = await createEvent({
        pinId,
        startsAt: iso,
        capacity,
        visibility,
        blurb,
        membersCanInviteFriends:
          visibility === "private" ? membersCanInviteFriends : false,
      });
      void ev.invite_token;
      router.refresh();
      onSuccess?.(ev.id);
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-2xl border border-white/35 bg-white/80 px-4 py-4 text-left shadow-[0_8px_32px_rgba(15,23,42,0.08)] backdrop-blur-md transition hover:border-emerald-200/80 dark:border-zinc-600 dark:bg-zinc-900/70 dark:hover:border-emerald-800/60"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/95 dark:text-emerald-300">
          Plan an outing
        </p>
        <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Create an event at this place
        </p>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Tap to add a time, details, and who can join — optional polls and chat
          after you publish.
        </p>
      </button>
    );
  }

  return (
    <div className="rounded-3xl border border-white/35 bg-white/92 p-5 shadow-[0_24px_64px_rgba(15,23,42,0.12)] backdrop-blur-md dark:border-zinc-600 dark:bg-zinc-900/82">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
          Create event
        </h3>
        {defaultCollapsed ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            Collapse
          </button>
        ) : null}
      </div>
      <NormReminder context="event" />
      <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium">Visibility</label>
          <select
            value={visibility}
            onChange={(e) => {
              const v = e.target.value as "public" | "private";
              setVisibility(v);
              if (v === "public") setMembersCanInviteFriends(false);
            }}
            className="mt-1 w-full rounded-xl border border-zinc-200/90 bg-white/70 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50"
          >
            <option value="public">Public — anyone can join until full</option>
            <option value="private">
              Private — only people you add from friends
            </option>
          </select>
        </div>
        {visibility === "private" ? (
          <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              className="mt-1"
              checked={membersCanInviteFriends}
              onChange={(e) => setMembersCanInviteFriends(e.target.checked)}
            />
            <span>
              Let anyone in the event invite their own friends (not only the
              host).
            </span>
          </label>
        ) : null}
        <div>
          <label className="block text-sm font-medium">Starts</label>
          <input
            type="datetime-local"
            required
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-200/90 bg-white/70 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Capacity</label>
          <input
            type="number"
            min={1}
            max={500}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-zinc-200/90 bg-white/70 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Blurb</label>
          <textarea
            required
            rows={3}
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            placeholder="Meeting spot, budget, what to expect…"
            className="mt-1 w-full rounded-xl border border-zinc-200/90 bg-white/70 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50"
          />
        </div>
        {err ? (
          <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create event"}
        </button>
      </form>
    </div>
  );
}
