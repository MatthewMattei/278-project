"use client";

import { createEvent } from "@/app/actions/events";
import { NormReminder } from "@/components/NormReminder";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function CreateEventForm({
  pinId,
  onSuccess,
}: {
  pinId: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [startsAt, setStartsAt] = useState("");
  const [capacity, setCapacity] = useState(8);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [blurb, setBlurb] = useState("");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (inviteToken && typeof window !== "undefined") {
      setInviteUrl(`${window.location.origin}/join?t=${inviteToken}`);
    }
  }, [inviteToken]);

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
      });
      if (visibility === "private") {
        setInviteToken(ev.invite_token);
      }
      router.refresh();
      onSuccess?.();
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="font-semibold">Create event</h3>
      <NormReminder context="event" />
      <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium">Starts</label>
          <input
            type="datetime-local"
            required
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
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
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Visibility</label>
          <select
            value={visibility}
            onChange={(e) =>
              setVisibility(e.target.value as "public" | "private")
            }
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
          >
            <option value="public">Public</option>
            <option value="private">Private (invite link)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Blurb</label>
          <textarea
            required
            rows={3}
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            placeholder="Meeting spot, budget, what to expect…"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
          />
        </div>
        {err ? (
          <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
        ) : null}
        {inviteUrl ? (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Private invite:{" "}
            <code className="break-all rounded bg-zinc-100 px-1 dark:bg-zinc-800">
              {inviteUrl}
            </code>
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create event"}
        </button>
      </form>
    </div>
  );
}
