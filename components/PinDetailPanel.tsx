"use client";

import {
  deleteGroupReview,
  deletePin,
  updateGroupReview,
  updatePin,
} from "@/app/actions/pins";
import { CreateEventForm } from "@/components/CreateEventForm";
import { EventRoom } from "@/components/EventRoom";
import {
  ReviewCommentTree,
  type ThreadComment,
} from "@/components/ReviewCommentTree";
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
  scope: "group";
  body: string;
  rating: number | null;
  stats: ReviewStats | null;
  member_summaries: MemberSummary[] | null;
  created_at: string;
  author_id: string | null;
  title: string | null;
  source_event_id: string | null;
};

type CommentRow = ThreadComment;

type AuthorProfile = { display_name: string; avatar_url: string | null };

type EventRow = {
  id: string;
  starts_at: string;
  capacity: number;
  visibility: string;
  status: string;
  blurb: string;
  planner_id: string;
  members_can_invite_friends: boolean;
};

type HomeSection = "events" | "reviews";

export function PinDetailPanel({
  pinId,
  onClose,
  onPinsChanged,
}: {
  pinId: string;
  onClose: () => void;
  /** Called after pin list on the map should refresh (e.g. after delete). */
  onPinsChanged?: () => void;
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
  const [authorProfiles, setAuthorProfiles] = useState<
    Map<string, AuthorProfile>
  >(() => new Map());
  const [pinTitleEdit, setPinTitleEdit] = useState("");
  const [editingPin, setEditingPin] = useState(false);
  const [groupReviewEdit, setGroupReviewEdit] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupBody, setGroupBody] = useState("");
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
  const [reviewCommentAnchorUserId, setReviewCommentAnchorUserId] = useState<
    string | null
  >(null);
  const [cardRefreshing, setCardRefreshing] = useState(false);

  const mapQuery = useCallback(
    (next: { event?: string | null; review?: string | null }) => {
      const p = new URLSearchParams();
      p.set("pin", pinId);
      const ev = next.event !== undefined ? next.event : eventIdParam;
      const rv = next.review !== undefined ? next.review : reviewIdParam;
      if (ev) p.set("event", ev);
      if (rv) p.set("review", rv);
      router.replace(`/map?${p.toString()}`, { scroll: false });
    },
    [router, pinId, eventIdParam, reviewIdParam],
  );

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

    const pr = pinRow as PinRow;
    setPin(pr);
    setPinTitleEdit(pr.title);

    const [{ data: reviewsData }, { data: eventsData }] = await Promise.all([
      supabase
        .from("reviews")
        .select(
          "id, scope, body, rating, stats, member_summaries, created_at, author_id, title, source_event_id",
        )
        .eq("pin_id", pinId)
        .eq("scope", "group")
        .order("created_at", { ascending: false }),
      supabase
        .from("events")
        .select(
          "id, starts_at, capacity, visibility, status, blurb, planner_id, members_can_invite_friends",
        )
        .eq("pin_id", pinId)
        .in("status", ["scheduled", "live", "review_open"])
        .order("starts_at", { ascending: true }),
    ]);

    const revs = (reviewsData ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        ...r,
        scope: "group" as const,
        stats: (r.stats as ReviewStats | null) ?? null,
        member_summaries: Array.isArray(r.member_summaries)
          ? (r.member_summaries as MemberSummary[])
          : null,
      } as ReviewRow;
    });
    setGroupReviews(revs);

    setEvents(
      (eventsData ?? []).map((e) => ({
        ...e,
        members_can_invite_friends: Boolean(
          (e as EventRow).members_can_invite_friends,
        ),
      })) as EventRow[],
    );

    const reviewIds = revs.map((r) => r.id);
    const { data: commentsData } = reviewIds.length
      ? await supabase
          .from("review_comments")
          .select(
            "id, review_id, author_id, body, created_at, parent_id, thread_anchor_user_id",
          )
          .in("review_id", reviewIds)
          .order("created_at", { ascending: true })
      : { data: [] as CommentRow[] };

    const cRows = (commentsData ?? []) as CommentRow[];
    setCommentRows(cRows);

    const sourceIds = [
      ...new Set(
        revs
          .map((r) => r.source_event_id)
          .filter((id): id is string => id != null),
      ),
    ];
    let plannerIdsFromSourceEvents: string[] = [];
    if (sourceIds.length) {
      const { data: evRows } = await supabase
        .from("events")
        .select("id, planner_id")
        .in("id", sourceIds);
      setPlannerByEventId(
        new Map((evRows ?? []).map((e) => [e.id, e.planner_id])),
      );
      plannerIdsFromSourceEvents = [
        ...new Set((evRows ?? []).map((e) => e.planner_id as string)),
      ];
    } else {
      setPlannerByEventId(new Map());
    }

    const memberIdsFromSummaries = [
      ...new Set(
        revs.flatMap((r) =>
          (r.member_summaries ?? []).map((m) => m.user_id),
        ),
      ),
    ];
    const commentAuthorIds = [...new Set(cRows.map((c) => c.author_id))];
    const allProfileIds = [
      ...new Set([
        ...commentAuthorIds,
        ...memberIdsFromSummaries,
        ...plannerIdsFromSourceEvents,
      ]),
    ];
    const { data: profiles } = allProfileIds.length
      ? await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", allProfileIds)
      : { data: [] as { id: string; display_name: string; avatar_url: string | null }[] };

    setAuthorProfiles(
      new Map(
        (profiles ?? []).map((p) => [
          p.id,
          { display_name: p.display_name, avatar_url: p.avatar_url },
        ]),
      ),
    );

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
    if (!result.ok || result.data.event.status === "completed") {
      void load();
    }
  }, [eventIdParam, myUserId, load]);

  const refreshCard = useCallback(async () => {
    setCardRefreshing(true);
    try {
      if (eventIdParam && myUserId) await reloadEventPayload();
      else await load();
      router.refresh();
    } finally {
      setCardRefreshing(false);
    }
  }, [load, reloadEventPayload, eventIdParam, myUserId, router]);

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

  useEffect(() => {
    if (!eventIdParam || !pinId || !eventPayload?.ok) return;
    if (eventPayload.data.event.status !== "completed") return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data: rev } = await supabase
        .from("reviews")
        .select("id")
        .eq("pin_id", pinId)
        .eq("scope", "group")
        .eq("source_event_id", eventIdParam)
        .maybeSingle();
      if (cancelled) return;
      if (rev?.id) mapQuery({ event: null, review: rev.id });
      else mapQuery({ event: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [eventIdParam, pinId, eventPayload, mapQuery]);

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

  const isHostOfActiveReview =
    !!activeReview?.source_event_id &&
    plannerByEventId.get(activeReview.source_event_id) === myUserId;

  useEffect(() => {
    if (activeReview) {
      setGroupTitle(activeReview.title ?? "");
      setGroupBody(activeReview.body);
      setGroupReviewEdit(false);
    }
  }, [activeReview?.id, activeReview?.title, activeReview?.body]);

  useEffect(() => {
    setReviewCommentAnchorUserId(null);
  }, [activeReview?.id]);

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
          <div className="flex shrink-0 items-center gap-2">
            {pin ? (
              <button
                type="button"
                disabled={loading || cardRefreshing}
                onClick={() => void refreshCard()}
                className="rounded-xl border border-zinc-200/90 bg-white/70 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {cardRefreshing ? "Refreshing…" : "Refresh"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-200/90 bg-white/70 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
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
            ) : eventPayload.data.event.status === "completed" ? (
              <p className="text-sm text-zinc-500">Opening group review…</p>
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
                <EventRoom
                  eventId={eventIdParam}
                  pinId={pin.id}
                  plannerId={eventPayload.data.event.planner_id}
                  status={eventPayload.data.event.status}
                  visibility={eventPayload.data.event.visibility}
                  initialMessages={eventPayload.data.messages}
                  initialReactions={eventPayload.data.reactions}
                  initialPolls={eventPayload.data.polls}
                  initialPollVotes={eventPayload.data.pollVotes}
                  memberRoster={eventPayload.data.memberRoster}
                  isPlanner={eventPayload.data.isPlanner}
                  isMember={eventPayload.data.isMember}
                  myUserId={myUserId ?? ""}
                  initialContributions={eventPayload.data.contributions}
                  showBackToPinLink={false}
                  onRefreshRoot={() => void reloadEventPayload()}
                  onEventDeleted={() => {
                    mapQuery({ event: null });
                    void load();
                  }}
                  onLeftEvent={() => {
                    mapQuery({ event: null });
                    void load();
                  }}
                  plannerProfile={eventPayload.data.plannerProfile}
                  eventStartsAt={eventPayload.data.event.starts_at}
                  eventBlurb={eventPayload.data.event.blurb}
                  eventCapacity={eventPayload.data.event.capacity}
                  membersCanInviteFriends={Boolean(
                    eventPayload.data.event.members_can_invite_friends,
                  )}
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
              {isHostOfActiveReview ? (
                <div className="mt-4 rounded-2xl border border-zinc-200/80 p-3 dark:border-zinc-700">
                  {!groupReviewEdit ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setGroupReviewEdit(true)}
                        className="rounded-xl border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-600"
                      >
                        Edit published summary
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            !confirm(
                              "Delete this group review for everyone? This cannot be undone.",
                            )
                          )
                            return;
                          void (async () => {
                            try {
                              await deleteGroupReview(activeReview.id);
                              mapQuery({ review: null });
                              await load();
                            } catch {
                              /* toast */
                            }
                          })();
                        }}
                        className="rounded-xl border border-red-200 px-3 py-1.5 text-sm text-red-700 dark:border-red-900 dark:text-red-400"
                      >
                        Delete group review
                      </button>
                    </div>
                  ) : (
                    <form
                      className="space-y-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void (async () => {
                          try {
                            await updateGroupReview(activeReview.id, {
                              title: groupTitle || null,
                              body: groupBody,
                            });
                            setGroupReviewEdit(false);
                            await load();
                          } catch {
                            /* */
                          }
                        })();
                      }}
                    >
                      <input
                        value={groupTitle}
                        onChange={(e) => setGroupTitle(e.target.value)}
                        placeholder="Title"
                        className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                      />
                      <textarea
                        value={groupBody}
                        onChange={(e) => setGroupBody(e.target.value)}
                        rows={6}
                        className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm text-white"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setGroupReviewEdit(false)}
                          className="text-sm text-zinc-500"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : null}
              <pre className="mt-4 whitespace-pre-wrap font-sans text-sm text-zinc-800 dark:text-zinc-200">
                {activeReview.body}
              </pre>
              {activeReview.member_summaries?.length ? (
                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/90 dark:text-emerald-300">
                    Everyone&apos;s take
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Tap someone&apos;s review to tie your comment to their
                    perspective (optional).
                  </p>
                  <ul className="mt-3 space-y-2">
                    {activeReview.member_summaries.map((m, i) => {
                      const reviewHostId =
                        activeReview.source_event_id &&
                        plannerByEventId.get(activeReview.source_event_id);
                      const isEventHost = reviewHostId === m.user_id;
                      const personName =
                        authorProfiles.get(m.user_id)?.display_name ??
                        "Member";
                      const selected =
                        reviewCommentAnchorUserId === m.user_id;
                      return (
                        <li key={`${m.user_id}-${i}`}>
                          <button
                            type="button"
                            onClick={() =>
                              setReviewCommentAnchorUserId((prev) =>
                                prev === m.user_id ? null : m.user_id,
                              )
                            }
                            className={`w-full rounded-2xl border px-3 py-2.5 text-left text-sm transition-colors dark:bg-zinc-900/40 ${
                              selected
                                ? "border-emerald-500 bg-emerald-50/90 dark:border-emerald-600 dark:bg-emerald-950/50"
                                : "border-zinc-200/80 bg-white/60 hover:border-emerald-200 dark:border-zinc-700"
                            }`}
                          >
                            <span className="font-medium text-zinc-900 dark:text-zinc-100">
                              {personName}
                            </span>
                            {isEventHost ? (
                              <span className="ml-2 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-950/80 dark:text-amber-200">
                                Hosted event
                              </span>
                            ) : null}
                            <span className="mt-1 block font-medium text-zinc-800 dark:text-zinc-200">
                              {m.rating}/5
                              <span className="font-normal text-zinc-600 dark:text-zinc-400">
                                {" "}
                                — {m.excerpt}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              {myUserId ? (
                <ReviewCommentTree
                  reviewId={activeReview.id}
                  comments={commentRows.filter(
                    (c) => c.review_id === activeReview.id,
                  )}
                  memberSummaries={activeReview.member_summaries ?? []}
                  authors={authorProfiles}
                  myUserId={myUserId}
                  threadAnchorUserId={reviewCommentAnchorUserId}
                  onThreadAnchorChange={setReviewCommentAnchorUserId}
                  onRefresh={() => void load()}
                />
              ) : null}
            </div>
          ) : null}

          {!loading &&
          pin &&
          !eventIdParam && !reviewIdParam ? (
            <>
              {pin.created_by === myUserId ? (
                <div className="mb-5 rounded-2xl border border-zinc-200/80 bg-white/70 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                  {!editingPin ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingPin(true)}
                        className="rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-600"
                      >
                        Edit place name
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            !confirm(
                              "Delete this place and its events from the map?",
                            )
                          )
                            return;
                          void (async () => {
                            try {
                              await deletePin(pin.id);
                              onPinsChanged?.();
                              onClose();
                            } catch {
                              /* */
                            }
                          })();
                        }}
                        className="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-400"
                      >
                        Delete place
                      </button>
                    </div>
                  ) : (
                    <form
                      className="flex flex-col gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void (async () => {
                          try {
                            await updatePin(pin.id, {
                              title: pinTitleEdit.trim(),
                            });
                            setEditingPin(false);
                            await load();
                          } catch {
                            /* */
                          }
                        })();
                      }}
                    >
                      <input
                        value={pinTitleEdit}
                        onChange={(e) => setPinTitleEdit(e.target.value)}
                        className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPin(false);
                            setPinTitleEdit(pin.title);
                          }}
                          className="text-sm text-zinc-500"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : null}

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
                        const reviewPlannerId =
                          r.source_event_id &&
                          plannerByEventId.get(r.source_event_id);
                        const hostName =
                          reviewPlannerId &&
                          authorProfiles.get(reviewPlannerId)?.display_name;
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
                              {hostName ? (
                                <p className="mt-1 text-xs font-medium text-amber-900/90 dark:text-amber-200/90">
                                  Event host: {hostName}
                                </p>
                              ) : null}
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
