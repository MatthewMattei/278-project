"use client";

import { createReviewComment } from "@/app/actions/pins";
import { CreateEventForm } from "@/components/CreateEventForm";
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

type CommentRow = {
  id: string;
  review_id: string;
  author_id: string;
  body: string;
  created_at: string;
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

function groupCommentsByReview(rows: CommentRow[]) {
  const m = new Map<string, CommentRow[]>();
  for (const c of rows) {
    const list = m.get(c.review_id) ?? [];
    list.push(c);
    m.set(c.review_id, list);
  }
  return m;
}

function ReviewThread({
  reviewId,
  comments,
  authorNames,
  onPosted,
}: {
  reviewId: string;
  comments: CommentRow[];
  authorNames: Map<string, string>;
  onPosted: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await createReviewComment(reviewId, body);
      setBody("");
      onPosted();
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Could not post");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase text-zinc-500">Discussion</p>
      <ul className="mt-2 space-y-3">
        {comments.length === 0 ? (
          <li className="text-sm text-zinc-500">No comments yet.</li>
        ) : (
          comments.map((c) => (
            <li
              key={c.id}
              className="rounded-lg bg-zinc-50/80 px-3 py-2 text-sm dark:bg-zinc-900/40"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-zinc-500">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {authorNames.get(c.author_id) ?? "Member"}
                </span>
                <span>{new Date(c.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
                {c.body}
              </p>
            </li>
          ))
        )}
      </ul>
      <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-2">
        <NormReminder context="review" />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
        />
        {err ? (
          <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
        ) : null}
        <button
          type="submit"
          disabled={busy || !body.trim()}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Posting…" : "Post comment"}
        </button>
      </form>
    </div>
  );
}

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
  const [groupReviews, setGroupReviews] = useState<ReviewRow[]>([]);
  const [commentRows, setCommentRows] = useState<CommentRow[]>([]);
  const [authorNames, setAuthorNames] = useState<Map<string, string>>(
    () => new Map(),
  );
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
      setGroupReviews([]);
      setCommentRows([]);
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
      .eq("scope", "group")
      .order("created_at", { ascending: false });

    const revs = (reviewsData ?? []) as ReviewRow[];
    setGroupReviews(revs);

    const reviewIds = revs.map((r) => r.id);
    const { data: commentsData } = reviewIds.length
      ? await supabase
          .from("review_comments")
          .select("id, review_id, author_id, body, created_at")
          .in("review_id", reviewIds)
          .order("created_at", { ascending: true })
      : { data: [] as CommentRow[] };

    const cRows = (commentsData ?? []) as CommentRow[];
    setCommentRows(cRows);

    const commentAuthorIds = [...new Set(cRows.map((c) => c.author_id))];
    const { data: profiles } = commentAuthorIds.length
      ? await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", commentAuthorIds)
      : { data: [] as { id: string; display_name: string }[] };

    setAuthorNames(
      new Map((profiles ?? []).map((p) => [p.id, p.display_name])),
    );

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

  const commentsByReview = groupCommentsByReview(commentRows);

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
                <h3 className="text-base font-semibold">Group reviews</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Summaries from completed events. Anyone signed in can comment.
                </p>
                <ul className="mt-4 space-y-6">
                  {groupReviews.length === 0 ? (
                    <li className="text-sm text-zinc-500">
                      No group reviews yet. When an event finishes its review
                      window, a summary appears here.
                    </li>
                  ) : (
                    groupReviews.map((r) => (
                      <li
                        key={r.id}
                        className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
                          {r.rating != null ? (
                            <span>{Number(r.rating).toFixed(1)} / 5 avg</span>
                          ) : null}
                          <span className="text-xs">
                            {new Date(r.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {r.title ? (
                          <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                            {r.title}
                          </p>
                        ) : null}
                        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-zinc-800 dark:text-zinc-200">
                          {r.body}
                        </pre>
                        {r.member_summaries ? (
                          <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                            <p className="text-xs font-medium uppercase text-zinc-500">
                              Perspectives from the event
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
                                  <span className="font-medium">
                                    {m.rating}/5
                                  </span>{" "}
                                  — {m.excerpt}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <ReviewThread
                          reviewId={r.id}
                          comments={commentsByReview.get(r.id) ?? []}
                          authorNames={authorNames}
                          onPosted={load}
                        />
                      </li>
                    ))
                  )}
                </ul>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
