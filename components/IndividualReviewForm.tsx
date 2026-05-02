"use client";

import { createIndividualReview } from "@/app/actions/pins";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function IndividualReviewForm({
  pinId,
  onSuccess,
}: {
  pinId: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rating, setRating] = useState(5);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await createIndividualReview(
        pinId,
        body,
        rating,
        title.trim() || undefined,
      );
      setBody("");
      setTitle("");
      router.refresh();
      onSuccess?.();
      setMsg("Thanks — your review is live.");
    } catch (er) {
      setMsg(er instanceof Error ? er.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3">
      <div>
        <label className="block text-sm font-medium">Title (optional)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Rating</label>
        <select
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} — {n === 5 ? "Loved it" : n === 1 ? "Poor" : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium">Review</label>
        <textarea
          required
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
        />
      </div>
      {msg ? (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{msg}</p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Publishing…" : "Publish review"}
      </button>
    </form>
  );
}
