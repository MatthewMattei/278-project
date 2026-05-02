"use client";

import {
  closeReviewManually,
  createPoll,
  deleteEvent,
  deleteEventMessage,
  joinPublicEvent,
  leaveEvent,
  openReviewWindow,
  postPlannerBroadcast,
  removeEventMember,
  setEventLive,
  submitContribution,
  toggleReaction,
  updateContribution,
  updateEventDetails,
  votePoll,
} from "@/app/actions/events";
import { AvatarImg } from "@/components/AvatarImg";
import { EventPrivateGuestPicker } from "@/components/EventPrivateGuestPicker";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  EventRoomMember,
  EventRoomPollVote,
  PlannerProfile,
} from "@/lib/events/event-room-data";

type Message = {
  id: string;
  body: string;
  kind: string;
  author_id: string;
  created_at: string;
};

type Reaction = {
  message_id: string;
  user_id: string;
  emoji: string;
};

type PollOption = { id: string; label_text: string; sort_order: number };
type Poll = {
  id: string;
  question: string;
  created_at: string;
  poll_options: PollOption[];
};

type ChatTimelineEntry =
  | { type: "message"; id: string; at: string; message: Message }
  | { type: "poll"; id: string; at: string; poll: Poll };

function formatChatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

type Contribution = { user_id: string; body: string; rating: number };

const EMOJIS = ["👍", "🎉", "❓"];

export function EventRoom({
  eventId,
  pinId,
  plannerId,
  status,
  visibility,
  initialMessages,
  initialReactions,
  initialPolls,
  initialPollVotes,
  memberRoster,
  isPlanner,
  isMember,
  myUserId,
  initialContributions,
  showBackToPinLink = true,
  onRefreshRoot,
  onEventDeleted,
  onLeftEvent,
  plannerProfile,
  eventStartsAt,
  eventBlurb,
  eventCapacity,
  membersCanInviteFriends,
}: {
  eventId: string;
  pinId: string;
  plannerId: string;
  status: string;
  visibility: string;
  initialMessages: Message[];
  initialReactions: Reaction[];
  initialPolls: Poll[];
  initialPollVotes: EventRoomPollVote[];
  memberRoster: EventRoomMember[];
  isPlanner: boolean;
  isMember: boolean;
  myUserId: string;
  initialContributions: Contribution[];
  showBackToPinLink?: boolean;
  onRefreshRoot?: () => void;
  onEventDeleted?: () => void;
  /** Called after the current user leaves as a non-host (e.g. clear map ?event=). */
  onLeftEvent?: () => void;
  plannerProfile?: PlannerProfile | null;
  eventStartsAt: string;
  eventBlurb: string;
  eventCapacity: number;
  membersCanInviteFriends: boolean;
}) {
  const router = useRouter();

  function refreshRoot() {
    onRefreshRoot?.();
    if (!onRefreshRoot) router.refresh();
  }
  const [messages, setMessages] = useState(initialMessages);
  const [reactions, setReactions] = useState(initialReactions);
  const [polls, setPolls] = useState(initialPolls);
  const [pollVotes, setPollVotes] = useState(initialPollVotes);
  const [contributions, setContributions] = useState(initialContributions);
  /** Avoid resetting chat state when parent passes new array refs with stale SSR payload. */
  const syncedEventIdRef = useRef<string | null>(null);
  const [liveStatus, setLiveStatus] = useState(status);
  const myContribution = contributions.find((c) => c.user_id === myUserId);
  const [broadcast, setBroadcast] = useState("");
  const [pollQ, setPollQ] = useState("");
  const [pollOpts, setPollOpts] = useState("Option A\nOption B");
  const [composerTab, setComposerTab] = useState<"message" | "poll">(
    "message",
  );
  const [revBody, setRevBody] = useState("");
  const [revRating, setRevRating] = useState(5);
  const [editContrib, setEditContrib] = useState(false);

  useEffect(() => {
    if (myContribution) {
      setRevBody(myContribution.body);
      setRevRating(myContribution.rating);
    }
  }, [myContribution]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState(false);
  const [editBlurb, setEditBlurb] = useState(eventBlurb);
  const [editCap, setEditCap] = useState(eventCapacity);
  const [editStarts, setEditStarts] = useState(() =>
    eventStartsAt.slice(0, 16),
  );
  const [editMemInvite, setEditMemInvite] = useState(membersCanInviteFriends);

  const eventNotStarted = useMemo(
    () => new Date(eventStartsAt).getTime() > Date.now(),
    [eventStartsAt],
  );

  useEffect(() => {
    setEditBlurb(eventBlurb);
    setEditCap(eventCapacity);
    setEditStarts(eventStartsAt.slice(0, 16));
    setEditMemInvite(membersCanInviteFriends);
  }, [eventBlurb, eventCapacity, eventStartsAt, membersCanInviteFriends]);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const { data: m } = await supabase
      .from("event_messages")
      .select("id, body, kind, author_id, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    const msgIds = (m ?? []).map((x) => x.id);
    const { data: r } =
      msgIds.length > 0
        ? await supabase
            .from("message_reactions")
            .select("message_id, user_id, emoji")
            .in("message_id", msgIds)
        : { data: [] as Reaction[] };

    const [{ data: p }, { data: c }] = await Promise.all([
      supabase
        .from("polls")
        .select("id, question, created_at, poll_options(id, label_text, sort_order)")
        .eq("event_id", eventId),
      supabase
        .from("review_contributions")
        .select("user_id, body, rating")
        .eq("event_id", eventId),
    ]);

    const pollList = (p ?? []) as Poll[];
    const pollIds = pollList.map((x) => x.id);
    const { data: pv } =
      pollIds.length > 0
        ? await supabase
            .from("poll_votes")
            .select("poll_id, option_id, user_id")
            .in("poll_id", pollIds)
        : { data: [] as EventRoomPollVote[] };

    setMessages((m ?? []) as Message[]);
    setReactions((r ?? []) as Reaction[]);
    setPolls(pollList);
    setPollVotes((pv ?? []) as EventRoomPollVote[]);
    setContributions((c ?? []) as Contribution[]);
  }, [eventId]);

  useEffect(() => {
    setLiveStatus(status);
  }, [status]);

  useEffect(() => {
    if (syncedEventIdRef.current === eventId) return;
    syncedEventIdRef.current = eventId;
    setMessages(initialMessages);
    setReactions(initialReactions);
    setPolls(initialPolls);
    setPollVotes(initialPollVotes);
    setContributions(initialContributions);
  }, [
    eventId,
    initialMessages,
    initialReactions,
    initialPolls,
    initialPollVotes,
    initialContributions,
  ]);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`room:${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "events",
          filter: `id=eq.${eventId}`,
        },
        (payload) => {
          const row = payload.new as { status?: string };
          if (typeof row?.status === "string") setLiveStatus(row.status);
          void reload();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_messages",
          filter: `event_id=eq.${eventId}`,
        },
        () => void reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => void reload(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "polls",
          filter: `event_id=eq.${eventId}`,
        },
        () => void reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "poll_votes" },
        () => void reload(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "review_contributions",
          filter: `event_id=eq.${eventId}`,
        },
        () => void reload(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [eventId, reload]);

  const reactionCount = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const react of reactions) {
      if (!map.has(react.message_id)) map.set(react.message_id, new Map());
      const inner = map.get(react.message_id)!;
      inner.set(react.emoji, (inner.get(react.emoji) ?? 0) + 1);
    }
    return map;
  }, [reactions]);

  const chatTimeline = useMemo((): ChatTimelineEntry[] => {
    const entries: ChatTimelineEntry[] = [
      ...messages.map((message) => ({
        type: "message" as const,
        id: `m:${message.id}`,
        at: message.created_at,
        message,
      })),
      ...polls.map((poll) => ({
        type: "poll" as const,
        id: `p:${poll.id}`,
        at: poll.created_at,
        poll,
      })),
    ];
    entries.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
    return entries;
  }, [messages, polls]);

  const attendeesSorted = useMemo(() => {
    const rows = [...memberRoster];
    rows.sort((a, b) => {
      if (a.user_id === plannerId) return -1;
      if (b.user_id === plannerId) return 1;
      return a.display_name.localeCompare(b.display_name);
    });
    return rows;
  }, [memberRoster, plannerId]);

  async function onJoin() {
    setErr(null);
    try {
      await joinPublicEvent(eventId);
      refreshRoot();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Join failed");
    }
  }

  async function onBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!broadcast.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const row = await postPlannerBroadcast(eventId, broadcast.trim());
      setBroadcast("");
      if (row) {
        setMessages((prev) =>
          prev.some((m) => m.id === row.id) ? prev : [...prev, row as Message],
        );
      }
      await reload();
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function onReact(messageId: string, emoji: string) {
    const had = reactions.some(
      (r) =>
        r.message_id === messageId &&
        r.user_id === myUserId &&
        r.emoji === emoji,
    );
    setReactions((prev) =>
      had
        ? prev.filter(
            (r) =>
              !(
                r.message_id === messageId &&
                r.user_id === myUserId &&
                r.emoji === emoji
              ),
          )
        : [...prev, { message_id: messageId, user_id: myUserId, emoji }],
    );
    void (async () => {
      try {
        await toggleReaction(messageId, emoji);
      } catch {
        await reload();
      }
    })();
  }

  async function onCreatePoll(e: React.FormEvent) {
    e.preventDefault();
    const opts = pollOpts
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!pollQ.trim() || opts.length < 2) return;
    setBusy(true);
    setErr(null);
    try {
      await createPoll({
        eventId,
        question: pollQ.trim(),
        options: opts,
      });
      setPollQ("");
      setPollOpts("Option A\nOption B");
      await reload();
      refreshRoot();
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function onVote(pollId: string, optionId: string) {
    const withoutMine = pollVotes.filter(
      (v) => !(v.poll_id === pollId && v.user_id === myUserId),
    );
    setPollVotes([
      ...withoutMine,
      { poll_id: pollId, option_id: optionId, user_id: myUserId },
    ]);
    void (async () => {
      try {
        await votePoll(pollId, optionId);
      } catch (er) {
        setErr(er instanceof Error ? er.message : "Vote failed");
        await reload();
      }
    })();
  }

  const inEvent = isMember || isPlanner;

  if (!inEvent) {
    return (
      <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="font-semibold">Join this event</h2>
        {visibility === "public" ? (
          <button
            type="button"
            onClick={() => void onJoin()}
            className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white"
          >
            Join public event
          </button>
        ) : (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            This event is private. Ask the host or someone already going to add
            you from their friends list.
          </p>
        )}
        {err ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>
        ) : null}
      </div>
    );
  }

  const reviewOpen = liveStatus === "review_open";
  const canInviteGuests =
    eventNotStarted &&
    inEvent &&
    (isPlanner || (membersCanInviteFriends && isMember));
  const canPlannerDeleteEvent =
    isPlanner &&
    (liveStatus === "scheduled" || liveStatus === "live");
  const canPlannerEditEventDetails = isPlanner && eventNotStarted;

  async function saveEventEdits(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await updateEventDetails(eventId, {
        blurb: editBlurb,
        capacity: editCap,
        startsAt: new Date(editStarts).toISOString(),
        membersCanInviteFriends: editMemInvite,
      });
      setEditingEvent(false);
      refreshRoot();
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeEvent() {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    setBusy(true);
    try {
      await deleteEvent(eventId);
      onEventDeleted?.();
      refreshRoot();
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-zinc-200/80 bg-white/60 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
        <AvatarImg
          src={plannerProfile?.avatar_url}
          alt={plannerProfile?.display_name ?? "Host"}
          size={44}
        />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Host
          </p>
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">
            {plannerProfile?.display_name ?? "Organizer"}
          </p>
        </div>
      </div>

      {(visibility === "private" || visibility === "public") && inEvent ? (
        <EventPrivateGuestPicker
          eventId={eventId}
          myUserId={myUserId}
          canInvite={canInviteGuests}
        />
      ) : null}

      {inEvent && !isPlanner ? (
        <div className="rounded-2xl border border-zinc-200/80 p-4 dark:border-zinc-700">
          <button
            type="button"
            disabled={busy}
            className="rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200"
            onClick={() => {
              if (
                !confirm(
                  "Leave this event? You can join again if it is public or someone invites you.",
                )
              ) {
                return;
              }
              void (async () => {
                setBusy(true);
                setErr(null);
                try {
                  await leaveEvent(eventId);
                  onLeftEvent?.();
                  if (!onLeftEvent) refreshRoot();
                } catch (er) {
                  setErr(
                    er instanceof Error ? er.message : "Could not leave event",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Leave event
          </button>
        </div>
      ) : null}

      {isPlanner ? (
        <div className="rounded-2xl border border-zinc-200/80 p-4 dark:border-zinc-700">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Who&apos;s planning to attend ({memberRoster.length})
          </p>
          <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-sm">
            {attendeesSorted.map((m) => (
              <li
                key={m.user_id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-zinc-900 dark:text-zinc-100">
                  {m.display_name}
                  {m.user_id === plannerId ? (
                    <span className="font-normal text-zinc-500"> · host</span>
                  ) : null}
                </span>
                {m.user_id !== plannerId ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
                    onClick={() => {
                      if (
                        !confirm(
                          `Remove ${m.display_name} from this event?`,
                        )
                      ) {
                        return;
                      }
                      void (async () => {
                        setBusy(true);
                        setErr(null);
                        try {
                          await removeEventMember(eventId, m.user_id);
                          await reload();
                          refreshRoot();
                        } catch (er) {
                          setErr(
                            er instanceof Error
                              ? er.message
                              : "Could not remove member",
                          );
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canPlannerEditEventDetails ? (
        <div className="rounded-2xl border border-zinc-200/80 p-4 dark:border-zinc-700">
          {!editingEvent ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditingEvent(true)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              >
                Edit event details
              </button>
              <button
                type="button"
                onClick={() => void removeEvent()}
                className="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-400"
              >
                Delete event
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void saveEventEdits(e)} className="space-y-3">
              <div>
                <label className="text-xs font-medium">Starts</label>
                <input
                  type="datetime-local"
                  value={editStarts}
                  onChange={(e) => setEditStarts(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Capacity</label>
                <input
                  type="number"
                  min={1}
                  value={editCap}
                  onChange={(e) => setEditCap(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Blurb</label>
                <textarea
                  value={editBlurb}
                  onChange={(e) => setEditBlurb(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                />
              </div>
              {visibility === "private" ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editMemInvite}
                    onChange={(e) => setEditMemInvite(e.target.checked)}
                  />
                  Members can invite their friends
                </label>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingEvent(false)}
                  className="text-sm text-zinc-500"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      ) : canPlannerDeleteEvent ? (
        <div className="rounded-2xl border border-zinc-200/80 p-4 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => void removeEvent()}
            className="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-400"
          >
            Delete event
          </button>
        </div>
      ) : null}

      {isPlanner ? (
        <div className="flex flex-wrap gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <button
            type="button"
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-white dark:bg-zinc-200 dark:text-zinc-900"
            onClick={() =>
              void (async () => {
                await setEventLive(eventId);
                refreshRoot();
              })()
            }
          >
            Mark live
          </button>
          <button
            type="button"
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-white"
            disabled={reviewOpen}
            title={
              reviewOpen
                ? "Review already open"
                : "Replace chat with group review for everyone"
            }
            onClick={() =>
              void (async () => {
                await openReviewWindow(eventId);
                refreshRoot();
              })()
            }
          >
            Open group review
          </button>
          <button
            type="button"
            className="rounded-lg border border-amber-600 px-3 py-1.5 text-sm text-amber-800 dark:text-amber-300"
            onClick={() =>
              void (async () => {
                await closeReviewManually(eventId);
                refreshRoot();
              })()
            }
          >
            Close review & publish summary
          </button>
        </div>
      ) : null}

      {reviewOpen ? (
        <div className="flex max-h-[min(72vh,640px)] min-h-[280px] flex-col overflow-hidden rounded-xl border-2 border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/25">
          <div className="shrink-0 border-b border-emerald-200 px-4 py-3 dark:border-emerald-900">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Group review
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {isPlanner
                ? "While the window is open, everyone who joined can submit or edit their own review. The checklist below is only visible to you as host."
                : "The review window is open — share your honest take. Be constructive; see community guidelines."}
            </p>
            {isPlanner ? (
              <div className="mt-3 rounded-lg border border-emerald-200/80 bg-white/70 p-3 dark:border-emerald-900 dark:bg-emerald-950/50">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                  Who has submitted
                </p>
                <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-sm text-zinc-700 dark:text-zinc-300">
                  {memberRoster.map((m) => {
                    const done = contributions.some(
                      (c) => c.user_id === m.user_id,
                    );
                    return (
                      <li
                        key={m.user_id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span>
                          {m.display_name}
                          {m.user_id === plannerId ? (
                            <span className="text-zinc-500"> · host</span>
                          ) : null}
                        </span>
                        <span
                          className={
                            done
                              ? "font-medium text-emerald-700 dark:text-emerald-400"
                              : "text-zinc-400"
                          }
                        >
                          {done ? "Done" : "Waiting"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {myContribution && !editContrib ? (
              <div className="space-y-2">
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  You submitted your review ({myContribution.rating}/5). You can
                  edit while this window is open.
                </p>
                <button
                  type="button"
                  onClick={() => setEditContrib(true)}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
                >
                  Edit my review
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void (async () => {
                    setBusy(true);
                    setErr(null);
                    try {
                      if (myContribution) {
                        await updateContribution(eventId, revBody, revRating);
                        setEditContrib(false);
                      } else {
                        await submitContribution(eventId, revBody, revRating);
                        setRevBody("");
                      }
                      await reload();
                      refreshRoot();
                    } catch (er) {
                      setErr(
                        er instanceof Error ? er.message : "Could not submit",
                      );
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-sm font-medium">Rating</label>
                  <select
                    value={revRating}
                    onChange={(e) => setRevRating(Number(e.target.value))}
                    className="mt-1 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                  >
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n}/5
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Your review
                  </label>
                  <textarea
                    required
                    value={revBody}
                    onChange={(e) => setRevBody(e.target.value)}
                    rows={5}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busy
                      ? "Saving…"
                      : myContribution
                        ? "Save changes"
                        : "Submit review"}
                  </button>
                  {myContribution && editContrib ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditContrib(false);
                        setRevBody(myContribution.body);
                        setRevRating(myContribution.rating);
                      }}
                      className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </form>
            )}
            <ul className="mt-6 space-y-2 border-t border-emerald-200/80 pt-4 text-sm text-zinc-600 dark:border-emerald-900 dark:text-zinc-400">
              <li className="text-xs font-medium uppercase text-zinc-500">
                Submissions ({contributions.length})
              </li>
              {contributions.map((c) => (
                <li key={c.user_id}>
                  {c.user_id === myUserId
                    ? "You"
                    : memberRoster.find((m) => m.user_id === c.user_id)
                        ?.display_name ?? "Member"}{" "}
                  — {c.rating}/5
                  {c.body ? (
                    <span className="block text-zinc-500">
                      {c.body.slice(0, 120)}
                      {c.body.length > 120 ? "…" : ""}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="flex max-h-[min(72vh,640px)] min-h-[280px] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Event chat
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              Messages and polls appear together, newest first. Only the host
              can post; everyone can react and vote.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <ul className="space-y-4">
              {chatTimeline.length === 0 ? (
                <li className="text-sm text-zinc-500">
                  Nothing here yet.
                  {isPlanner
                    ? " Use the form below to send an update or start a poll."
                    : ""}
                </li>
              ) : (
                chatTimeline.map((entry) =>
                  entry.type === "message" ? (
                    <li
                      key={entry.id}
                      className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/50"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="text-xs text-zinc-500">
                          <span className="font-medium uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                            {entry.message.kind === "planner_broadcast"
                              ? "Host"
                              : entry.message.kind === "system"
                                ? "Update"
                                : entry.message.kind}
                          </span>
                          <span className="mx-2 text-zinc-300 dark:text-zinc-600">
                            ·
                          </span>
                          <time dateTime={entry.message.created_at}>
                            {formatChatTime(entry.message.created_at)}
                          </time>
                        </div>
                        {isPlanner ? (
                          <button
                            type="button"
                            className="text-xs text-red-600 hover:underline dark:text-red-400"
                            disabled={busy}
                            onClick={() => {
                              if (
                                !confirm(
                                  "Delete this message for everyone?",
                                )
                              ) {
                                return;
                              }
                              void (async () => {
                                setBusy(true);
                                setErr(null);
                                try {
                                  await deleteEventMessage(entry.message.id);
                                  await reload();
                                  refreshRoot();
                                } catch (er) {
                                  setErr(
                                    er instanceof Error
                                      ? er.message
                                      : "Could not delete",
                                  );
                                } finally {
                                  setBusy(false);
                                }
                              })();
                            }}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-2 text-zinc-900 dark:text-zinc-100">
                        {entry.message.body}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {EMOJIS.map((em) => {
                          const mine = reactions.some(
                            (r) =>
                              r.message_id === entry.message.id &&
                              r.user_id === myUserId &&
                              r.emoji === em,
                          );
                          return (
                            <button
                              key={em}
                              type="button"
                              className={`rounded border px-2 py-0.5 text-sm transition-colors ${
                                mine
                                  ? "border-emerald-500 bg-emerald-100/90 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/80 dark:text-emerald-100"
                                  : "border-zinc-200 dark:border-zinc-700"
                              }`}
                              onClick={() => onReact(entry.message.id, em)}
                            >
                              {em}{" "}
                              {reactionCount.get(entry.message.id)?.get(em) ??
                                0}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  ) : (
                    <li key={entry.id} className="space-y-2">
                      <div className="text-xs text-zinc-500">
                        <span className="font-medium uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                          Poll
                        </span>
                        <span className="mx-2 text-zinc-300 dark:text-zinc-600">
                          ·
                        </span>
                        <time dateTime={entry.poll.created_at}>
                          {formatChatTime(entry.poll.created_at)}
                        </time>
                      </div>
                      <PollBlock
                        poll={entry.poll}
                        myUserId={myUserId}
                        pollVotes={pollVotes}
                        onVote={onVote}
                      />
                    </li>
                  ),
                )
              )}
            </ul>
          </div>
          {isPlanner ? (
            <div className="shrink-0 border-t border-zinc-200 bg-zinc-50/90 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-900/80">
              <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Post as host
              </p>
              <div className="mb-2 flex gap-1 rounded-lg bg-zinc-200/80 p-0.5 dark:bg-zinc-800">
                <button
                  type="button"
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                    composerTab === "message"
                      ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                  onClick={() => setComposerTab("message")}
                >
                  Message
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                    composerTab === "poll"
                      ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                  onClick={() => setComposerTab("poll")}
                >
                  Poll
                </button>
              </div>
              {composerTab === "message" ? (
                <form
                  onSubmit={(e) => void onBroadcast(e)}
                  className="space-y-2"
                >
                  <textarea
                    value={broadcast}
                    onChange={(e) => setBroadcast(e.target.value)}
                    placeholder="Update everyone — logistics, timing, meeting spot…"
                    rows={2}
                    className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Send
                  </button>
                </form>
              ) : (
                <form
                  onSubmit={(e) => void onCreatePoll(e)}
                  className="space-y-2"
                >
                  <input
                    value={pollQ}
                    onChange={(e) => setPollQ(e.target.value)}
                    placeholder="Poll question"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                  />
                  <textarea
                    value={pollOpts}
                    onChange={(e) => setPollOpts(e.target.value)}
                    placeholder="One option per line"
                    rows={2}
                    className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-lg bg-zinc-800 py-2 text-sm text-white dark:bg-zinc-200 dark:text-zinc-900"
                  >
                    Create poll
                  </button>
                </form>
              )}
            </div>
          ) : null}
        </div>
      )}

      {err ? (
        <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
      ) : null}

      {showBackToPinLink ? (
        <p className="text-sm">
          <a
            href={`/map?pin=${encodeURIComponent(pinId)}`}
            className="text-emerald-700 underline dark:text-emerald-400"
          >
            Back to pin
          </a>
        </p>
      ) : null}
    </div>
  );
}

function PollBlock({
  poll,
  myUserId,
  pollVotes,
  onVote,
}: {
  poll: Poll;
  myUserId: string;
  pollVotes: EventRoomPollVote[];
  onVote: (pollId: string, optionId: string) => void;
}) {
  const forPoll = useMemo(
    () => pollVotes.filter((v) => v.poll_id === poll.id),
    [poll.id, pollVotes],
  );

  const countMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of forPoll) {
      m.set(v.option_id, (m.get(v.option_id) ?? 0) + 1);
    }
    return m;
  }, [forPoll]);

  const myVote = useMemo(
    () => forPoll.find((v) => v.user_id === myUserId),
    [forPoll, myUserId],
  );

  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="font-medium text-zinc-900 dark:text-zinc-50">
        {poll.question}
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Choose one option. You can change your vote anytime.
      </p>
      <ul className="mt-3 space-y-2">
        {[...(poll.poll_options ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((o) => {
            const selected = myVote?.option_id === o.id;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => onVote(poll.id, o.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                    selected
                      ? "border-emerald-600 bg-emerald-50 text-zinc-900 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-zinc-50"
                      : "border-zinc-200 bg-white/80 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600"
                  }`}
                >
                  <span className="font-medium">{o.label_text}</span>
                  <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                    {countMap.get(o.id) ?? 0}{" "}
                    {(countMap.get(o.id) ?? 0) === 1 ? "vote" : "votes"}
                  </span>
                </button>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
