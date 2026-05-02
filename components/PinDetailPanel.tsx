"use client";

import { CreateEventForm } from "@/components/CreateEventForm";
import { IndividualReviewForm } from "@/components/IndividualReviewForm";
import { NormReminder } from "@/components/NormReminder";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type PinRow = {
  id: string;
  title: string;
  lat: number;
  lng: number;
  created_by: string;
};

type ReviewRow = {
  id: string;
  scope: string;
  body: string;
  rating: number | null;
  stats: unknown;
  member_summaries: unknown;
  created_at: string;
  author_id: string | null;
  title: string | null;
};

type EventRow = {
  id: string;
  starts_at: string;
  capacity: number;
  visibility: string;
  status: string;
  blurb: string;
  planner_id: string;
};

export function PinDetailPanel({
  pinId,
  onClose,
}: {
  pinId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState<PinRow | null>(null);
  const [sortedReviews, setSortedReviews] = useState<ReviewRow[]>([]);
  const [authorName, setAuthorName] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [friendIds, setFriendIds] = useState<Set<string>>(() => new Set());
  const [events, setEvents] = useState<EventRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in.");
      setPin(null);
      setLoading(false);
      return;
    }

    const { data: pinRow, error: pinErr } = await supabase
      .from("pins")
      .select("id, title, lat, lng, created_by")
      .eq("id", pinId)
      .single();

    if (pinErr || !pinRow) {
      setError("Place not found.");
      setPin(null);
      setSortedReviews([]);
      setEvents([]);
      setLoading(false);
      return;
    }

    setPin(pinRow as PinRow);

    const { data: reviewsData } = await supabase
      .from("reviews")
      .select(
        "id, scope, body, rating, stats, member_summaries, created_at, author_id, title",
      )
      .eq("pin_id", pinId)
      .order("created_at", { ascending: false });

    const { data: friendRows } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    const fIds = new Set<string>();
    for (const f of friendRows ?? []) {
      fIds.add(f.requester_id === user.id ? f.addressee_id : f.requester_id);
    }
    setFriendIds(fIds);

    const revs = (reviewsData ?? []) as ReviewRow[];

    const authorIds = [
      ...new Set(revs.map((r) => r.author_id).filter(Boolean) as string[]),
    ];

    const { data: authors } = authorIds.length
      ? await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", authorIds)
      : { data: [] as { id: string; display_name: string }[] };

    setAuthorName(
      new Map((authors ?? []).map((a) => [a.id, a.display_name])),
    );

    const sorted = [...revs].sort((a, b) => {
      const fa =
        a.author_id && a.scope === "individual" && fIds.has(a.author_id)
          ? 1
          : 0;
      const fb =
        b.author_id && b.scope === "individual" && fIds.has(b.author_id)
          ? 1
          : 0;
      if (fb !== fa) return fb - fa;
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
    setSortedReviews(sorted);

    const { data: eventsData } = await supabase
      .from("events")
      .select("id, starts_at, capacity, visibility, status, blurb, planner_id")
      .eq("pin_id", pinId)
      .order("starts_at", { ascending: true });

    setEvents((eventsData ?? []) as EventRow[]);
    setLoading(false);
  }, [pinId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <button
        type="button"
        aria-label="Close place details"
        className="absolute inset-0 z-[999] bg-black/20 backdrop-blur-[1px] md:hidden"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 z-[1000] flex h-full w-full max-w-[min(420px,100%)] flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950 md:w-[min(420px,100%)]">
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="min-w-0 flex-1">
            {loading ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : pin ? (
              <>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  {pin.title}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                </p>
              </>
            ) : (
              <p className="text-sm text-red-600 dark:text-red-400">
                {error ?? "Unable to load place."}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-zinc-300 px-2.5 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
          {!loading && pin ? (
            <>
              <section>
                <h3 className="text-base font-semibold">Events</h3>
                <ul className="mt-3 space-y-2">
                  {events.length === 0 ? (
                    <li className="text-sm text-zinc-500">No events yet.</li>
                  ) : (
                    events.map((ev) => (
                      <li key={ev.id}>
                        <Link
                          href={`/events/${ev.id}`}
                          className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                        >
                          {new Date(ev.starts_at).toLocaleString()} —{" "}
                          {ev.status} ({ev.visibility})
                        </Link>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          {ev.blurb.slice(0, 120)}
                          {ev.blurb.length > 120 ? "…" : ""}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
                <div className="mt-6">
                  <CreateEventForm pinId={pin.id} onSuccess={load} />
                </div>
              </section>

              <section className="mt-10">
                <h3 className="text-base font-semibold">Reviews</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Friend reviews are shown first when you view this pin.
                </p>
                <ul className="mt-4 space-y-4">
                  {sortedReviews.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
                        <span className="uppercase">{r.scope}</span>
                        {r.rating != null ? (
                          <span>{Number(r.rating).toFixed(1)} / 5</span>
                        ) : null}
                        {r.author_id ? (
                          <span>
                            {authorName.get(r.author_id) ?? "Member"}
                            {friendIds.has(r.author_id) ? " · Friend" : ""}
                          </span>
                        ) : null}
                      </div>
                      {r.title ? (
                        <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                          {r.title}
                        </p>
                      ) : null}
                      <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-zinc-800 dark:text-zinc-200">
                        {r.body}
                      </pre>
                      {r.scope === "group" && r.member_summaries ? (
                        <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                          <p className="text-xs font-medium uppercase text-zinc-500">
                            Individual perspectives
                          </p>
                          <ul className="mt-2 space-y-2">
                            {(
                              r.member_summaries as {
                                excerpt: string;
                                rating: number;
                                user_id: string;
                              }[]
                            ).map((m, i) => (
                              <li
                                key={i}
                                className="text-sm text-zinc-700 dark:text-zinc-300"
                              >
                                <span className="font-medium">{m.rating}/5</span>{" "}
                                — {m.excerpt}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="mt-10 rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900 dark:bg-amber-950/40">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  Your review
                </h3>
                <NormReminder context="review" />
                <IndividualReviewForm pinId={pin.id} onSuccess={load} />
              </section>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
