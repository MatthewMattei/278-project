"use client";

import { createReviewComment } from "@/app/actions/pins";
import { CreateEventForm } from "@/components/CreateEventForm";
import { EventRoom } from "@/components/EventRoom";
import { NormReminder } from "@/components/NormReminder";
import { loadEventRoomPayload } from "@/lib/events/event-room-data";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type PinRow = {
  id: string;
  title: string;
  lat: number;
  lng: number;
  created_by: string;
};

type ReviewStats = {
  avg?: number;
  count?: number;
  distribution?: Record<string, number>;
};

type MemberSummary = {
  user_id: string;
  excerpt: string;
  rating: number;
};

type ReviewRow = {
  id: string;
  scope: string;
  body: string;
  rating: number | null;
  stats: ReviewStats | null;
  member_summaries: MemberSummary[] | null;
  created_at: string;
  author_id: string | null;
  title: string | null;
  source_event_id: string | null;
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
    <div className="mt-6 border-t border-zinc-200/80 pt-6 dark:border-zinc-700">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/90 dark:text-emerald-300">
        Discussion
      </p>
      <ul className="mt-3 space-y-3">
        {comments.length === 0 ? (
          <li className="text-sm text-zinc-500">No comments yet.</li>
        ) : (
          comments.map((c) => (
            <li
              key={c.id}
              className="rounded-2xl border border-zinc-200/80 bg-white/60 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/40"
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
          className="w-full rounded-xl border border-zinc-200/90 bg-white/70 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/50"
        />
        {err ? (
          <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
        ) : null}
        <button
          type="submit"
          disabled={busy || !body.trim()}
          className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Posting…" : "Post comment"}
        </button>
      </form>
    </div>
  );
}

type HomeSection = "events" | "reviews";

export function PinDetailPanel({
  pinId,
  onClose,
}: {
  pinId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventIdParam = searchParams.get("event");
  const reviewIdParam = searchParams.get("review");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState<PinRow | null>(null);
  const [groupReviews, setGroupReviews] = useState<ReviewRow[]>([]);
  const [commentRows, setCommentRows] = useState<CommentRow[]>([]);
  const [authorNames, setAuthorNames] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [events, setEvents] = useState<EventRow[]>([]);
  const [plannerByEventId, setPlannerByEventId] = useState<
    Map<string, string>
  >(() => new Map());
  const [homeSection, setHomeSection] = useState<HomeSection>("events");

  const [eventPayload, setEventPayload] = useState<Awaited<
    ReturnType<typeof loadEventRoomPayload>
  > | null>(null);
  const [eventLoading, setEventLoading] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  function mapQuery(next: { event?: string | null; review?: string | null }) {
    const p = new URLSearchParams();
    p.set("pin", pinId);
    const ev = next.event !== undefined ? next.event : eventIdParam;
    const rv = next.review !== undefined ? next.review : reviewIdParam;
    if (ev) p.set("event", ev);
    if (rv) p.set("review", rv);
    router.replace(`/map?${p.toString()}`, { scroll: false });
  }

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
    setMyUserId(user.id);

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
        "id, scope, body, rating, stats, member_summaries, created_at, author_id, title, source_event_id",
      )
      .eq("pin_id", pinId)
      .eq("scope", "group")
      .order("created_at", { ascending: false });

    const revs = (reviewsData ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        ...r,
        stats: (r.stats as ReviewStats | null) ?? null,
        member_summaries: Array.isArray(r.member_summaries)
          ? (r.member_summaries as MemberSummary[])
          : null,
      } as ReviewRow;
    });
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
      .in("status", ["scheduled", "live", "review_open"])
      .order("starts_at", { ascending: true });

    setEvents((eventsData ?? []) as EventRow[]);

    const sourceIds = [
      ...new Set(
        revs
          .map((r) => r.source_event_id)
          .filter((id): id is string => id != null),
      ),
    ];
    if (sourceIds.length) {
      const { data: evRows } = await supabase
        .from("events")
        .select("id, planner_id")
        .in("id", sourceIds);
      setPlannerByEventId(
        new Map((evRows ?? []).map((e) => [e.id, e.planner_id])),
      );
    } else {
      setPlannerByEventId(new Map());
    }

    setLoading(false);
  }, [pinId]);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadEventPayload = useCallback(async () => {
    if (!eventIdParam || !myUserId) return;
    setEventLoading(true);
    const supabase = createClient();
    const result = await loadEventRoomPayload(
      supabase,
      eventIdParam,
      myUserId,
    );
    setEventPayload(result);
    setEventLoading(false);
    void load();
  }, [eventIdParam, myUserId, load]);

  useEffect(() => {
    if (!eventIdParam || !myUserId) {
      setEventPayload(null);
      return;
    }
    let cancelled = false;
    setEventLoading(true);
    const supabase = createClient();
    void (async () => {
      const result = await loadEventRoomPayload(
        supabase,
        eventIdParam,
        myUserId,
      );
      if (!cancelled) {
        setEventPayload(result);
        setEventLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventIdParam, myUserId]);

  const commentsByReview = groupCommentsByReview(commentRows);

  const activeReview = useMemo(
    () => groupReviews.find((r) => r.id === reviewIdParam) ?? null,
    [groupReviews, reviewIdParam],
  );

  function hostExcerpt(r: ReviewRow): string | null {
    const evtId = r.source_event_id;
    if (!evtId) return null;
    const plannerId = plannerByEventId.get(evtId);
    const summaries = r.member_summaries ?? [];
    if (plannerId) {
      const host = summaries.find((m) => m.user_id === plannerId);
      if (host?.excerpt?.trim()) return host.excerpt.trim();
    }
    const first = summaries[0];
    if (first?.excerpt?.trim()) return first.excerpt.trim();
    return null;
  }

  function reviewPersonCount(r: ReviewRow): number {
    const n = r.stats?.count;
    if (typeof n === "number" && n > 0) return n;
    return r.member_summaries?.length ?? 0;
  }

  function reviewStarDisplay(r: ReviewRow): string | null {
    const v = r.rating ?? r.stats?.avg;
    if (v == null || Number.isNaN(Number(v))) return null;
    return Number(v).toFixed(1);
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close place details"
        className="fixed inset-0 z-[998] bg-black/25 backdrop-blur-[1px] md:bg-black/15"
        onClick={onClose}
      />
      <div
        className="fixed bottom-20 right-3 top-[4.75rem] z-[1000] flex w-[min(100%-1.5rem,520px)] flex-col overflow-hidden rounded-3xl border border-white/35 bg-white/95 shadow-[0_24px_64px_rgba(15,23,42,0.28)] backdrop-blur-md dark:border-zinc-600 dark:bg-zinc-900/92 sm:bottom-6 sm:right-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-detail-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-zinc-200/80 px-4 py-3 dark:border-zinc-700">
          <div className="min-w-0 flex-1">
            {eventIdParam ? (
              <button
                type="button"
                onClick={() => mapQuery({ event: null })}
                className="mb-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              >
                ← Back to place
              </button>
            ) : null}
            {reviewIdParam ? (
              <button
                type="button"
                onClick={() => mapQuery({ review: null })}
                className="mb-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              >
                ← Back to place
              </button>
            ) : null}
            {loading ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : pin ? (
              <>
                <h2
                  id="pin-detail-title"
                  className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
                >
                  {reviewIdParam && activeReview?.title
                    ? activeReview.title
                    : pin.title}
                </h2>
                {!reviewIdParam && !eventIdParam ? (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                  </p>
                ) : null}
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
            className="shrink-0 rounded-xl border border-zinc-200/90 bg-white/70 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
          {!loading && pin && eventIdParam ? (
            eventLoading || !eventPayload ? (
              <p className="text-sm text-zinc-500">Loading event…</p>
            ) : eventPayload.ok === false ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                Event not found.
              </p>
            ) : eventPayload.data.event.pin_id !== pin.id ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                This event is not for this place.
              </p>
            ) : !myUserId ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-zinc-500">
                  {new Date(eventPayload.data.event.starts_at).toLocaleString()}{" "}
                  · {eventPayload.data.event.status} ·{" "}
                  {eventPayload.data.event.visibility}
                </p>
                <p className="text-sm text-zinc-800 dark:text-zinc-200">
                  {eventPayload.data.event.blurb}
                </p>
                {eventPayload.data.event.visibility === "private" &&
                eventPayload.data.isPlanner ? (
                  <p className="break-all text-xs text-zinc-500">
                    Invite:{" "}
                    {typeof window !== "undefined"
                      ? `${window.location.origin}/join?t=${eventPayload.data.event.invite_token ?? ""}`
                      : `/join?t=${eventPayload.data.event.invite_token ?? ""}`}
                  </p>
                ) : null}
                <EventRoom
                  eventId={eventIdParam}
                  pinId={pin.id}
                  status={eventPayload.data.event.status}
                  visibility={eventPayload.data.event.visibility}
                  initialMessages={eventPayload.data.messages}
                  initialReactions={eventPayload.data.reactions}
                  initialPolls={eventPayload.data.polls}
                  isPlanner={eventPayload.data.isPlanner}
                  isMember={eventPayload.data.isMember}
                  myUserId={myUserId ?? ""}
                  initialContributions={eventPayload.data.contributions}
                  showBackToPinLink={false}
                  onRefreshRoot={() => void reloadEventPayload()}
                />
              </div>
            )
          ) : null}

          {!loading && pin && reviewIdParam && !activeReview ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              Review not found.
            </p>
          ) : null}

          {!loading && pin && reviewIdParam && activeReview ? (
            <div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                {reviewStarDisplay(activeReview) ? (
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {reviewStarDisplay(activeReview)} / 5
                  </span>
                ) : null}
                <span>
                  {reviewPersonCount(activeReview)} 🧑
                </span>
                <span className="text-xs">
                  {new Date(activeReview.created_at).toLocaleDateString()}
                </span>
              </div>
              <pre className="mt-4 whitespace-pre-wrap font-sans text-sm text-zinc-800 dark:text-zinc-200">
                {activeReview.body}
              </pre>
              {activeReview.member_summaries?.length ? (
                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/90 dark:text-emerald-300">
                    Everyone&apos;s take
                  </p>
                  <ul className="mt-3 space-y-2">
                    {activeReview.member_summaries.map((m, i) => (
                      <li
                        key={`${m.user_id}-${i}`}
                        className="rounded-2xl border border-zinc-200/80 bg-white/60 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/40"
                      >
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          {m.rating}/5
                        </span>
                        <span className="text-zinc-600 dark:text-zinc-400">
                          {" "}
                          — {m.excerpt}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <ReviewThread
                reviewId={activeReview.id}
                comments={commentsByReview.get(activeReview.id) ?? []}
                authorNames={authorNames}
                onPosted={load}
              />
            </div>
          ) : null}

          {!loading &&
          pin &&
          !eventIdParam && !reviewIdParam ? (
            <>
              <div className="flex rounded-2xl border border-zinc-200/90 bg-white/50 p-0.5 dark:border-zinc-700 dark:bg-zinc-900/40">
                <button
                  type="button"
                  onClick={() => setHomeSection("events")}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    homeSection === "events"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  Events
                </button>
                <button
                  type="button"
                  onClick={() => setHomeSection("reviews")}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    homeSection === "reviews"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  Reviews
                </button>
              </div>

              {homeSection === "events" ? (
                <section className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/95 dark:text-emerald-300">
                    Upcoming
                  </p>
                  <ul className="mt-3 space-y-3">
                    {events.length === 0 ? (
                      <li className="text-sm text-zinc-500">
                        No upcoming events. Past visits show up as group reviews.
                      </li>
                    ) : (
                      events.map((ev) => (
                        <li key={ev.id}>
                          <button
                            type="button"
                            onClick={() =>
                              mapQuery({ event: ev.id, review: null })
                            }
                            className="w-full rounded-2xl border border-zinc-200/80 bg-white/70 px-4 py-3 text-left transition hover:border-emerald-200 dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:border-emerald-800"
                          >
                            <span className="font-medium text-emerald-800 dark:text-emerald-300">
                              {new Date(ev.starts_at).toLocaleString()}
                            </span>
                            <span className="text-sm text-zinc-600 dark:text-zinc-400">
                              {" "}
                              · {ev.status} ({ev.visibility})
                            </span>
                            <p className="mt-1 line-clamp-2 text-sm text-zinc-700 dark:text-zinc-300">
                              {ev.blurb}
                            </p>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                  <div className="mt-6">
                    <CreateEventForm
                      pinId={pin.id}
                      defaultCollapsed
                      onSuccess={(newId) => {
                        void load();
                        mapQuery({ event: newId, review: null });
                      }}
                    />
                  </div>
                </section>
              ) : (
                <section className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/95 dark:text-emerald-300">
                    Group reviews
                  </p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    Summaries from completed events. Open one to see every
                    perspective and comment.
                  </p>
                  <ul className="mt-4 space-y-3">
                    {groupReviews.length === 0 ? (
                      <li className="text-sm text-zinc-500">
                        No group reviews yet.
                      </li>
                    ) : (
                      groupReviews.map((r) => {
                        const host = hostExcerpt(r);
                        const stars = reviewStarDisplay(r);
                        const count = reviewPersonCount(r);
                        return (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() =>
                                mapQuery({ review: r.id, event: null })
                              }
                              className="w-full rounded-2xl border border-zinc-200/80 bg-white/70 px-4 py-4 text-left shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:border-emerald-200/90 dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:border-emerald-800/60"
                            >
                              <div className="flex flex-wrap items-center gap-2 text-sm">
                                {stars ? (
                                  <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                                    {stars} ★
                                  </span>
                                ) : null}
                                <span className="text-zinc-600 dark:text-zinc-400">
                                  {count} 🧑
                                </span>
                                <span className="text-xs text-zinc-500">
                                  {new Date(r.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              {r.title ? (
                                <p className="mt-2 font-medium text-zinc-900 dark:text-zinc-100">
                                  {r.title}
                                </p>
                              ) : null}
                              {host ? (
                                <p className="mt-2 line-clamp-3 text-sm text-zinc-700 dark:text-zinc-300">
                                  <span className="font-medium text-emerald-800 dark:text-emerald-300">
                                    Host —{" "}
                                  </span>
                                  {host}
                                </p>
                              ) : (
                                <p className="mt-2 text-sm italic text-zinc-500">
                                  Open to read the full summary and comments.
                                </p>
                              )}
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </section>
              )}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
