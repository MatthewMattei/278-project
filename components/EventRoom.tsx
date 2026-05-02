"use client";

import {
  addReaction,
  closeReviewManually,
  createPoll,
  joinPublicEvent,
  openReviewWindow,
  postPlannerBroadcast,
  setEventLive,
  submitContribution,
  votePoll,
} from "@/app/actions/events";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  poll_options: PollOption[];
};

type Contribution = { user_id: string; body: string; rating: number };

const EMOJIS = ["👍", "🎉", "❓"];

export function EventRoom({
  eventId,
  pinId,
  status,
  visibility,
  initialMessages,
  initialReactions,
  initialPolls,
  isPlanner,
  isMember,
  myUserId,
  initialContributions,
}: {
  eventId: string;
  pinId: string;
  status: string;
  visibility: string;
  initialMessages: Message[];
  initialReactions: Reaction[];
  initialPolls: Poll[];
  isPlanner: boolean;
  isMember: boolean;
  myUserId: string;
  initialContributions: Contribution[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [reactions, setReactions] = useState(initialReactions);
  const [polls, setPolls] = useState(initialPolls);
  const [contributions, setContributions] = useState(initialContributions);
  const myContribution = contributions.find((c) => c.user_id === myUserId);
  const [broadcast, setBroadcast] = useState("");
  const [pollQ, setPollQ] = useState("");
  const [pollOpts, setPollOpts] = useState("Option A\nOption B");
  const [revBody, setRevBody] = useState("");
  const [revRating, setRevRating] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
        .select("id, question, poll_options(id, label_text, sort_order)")
        .eq("event_id", eventId),
      supabase
        .from("review_contributions")
        .select("user_id, body, rating")
        .eq("event_id", eventId),
    ]);

    setMessages((m ?? []) as Message[]);
    setReactions((r ?? []) as Reaction[]);
    setPolls((p ?? []) as Poll[]);
    setContributions((c ?? []) as Contribution[]);
  }, [eventId]);

  useEffect(() => {
    setMessages(initialMessages);
    setReactions(initialReactions);
    setPolls(initialPolls);
    setContributions(initialContributions);
  }, [
    initialMessages,
    initialReactions,
    initialPolls,
    initialContributions,
  ]);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`room:${eventId}`)
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

  async function onJoin() {
    setErr(null);
    try {
      await joinPublicEvent(eventId);
      router.refresh();
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
      await postPlannerBroadcast(eventId, broadcast.trim());
      setBroadcast("");
      await reload();
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function onReact(messageId: string, emoji: string) {
    try {
      await addReaction(messageId, emoji);
      await reload();
    } catch {
      /* duplicate ok */
    }
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
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function onVote(pollId: string, optionId: string) {
    try {
      await votePoll(pollId, optionId);
      await reload();
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Vote failed");
    }
  }

  if (!isMember) {
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
            This event is private. Ask the planner for an invite link.
          </p>
        )}
        {err ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>
        ) : null}
      </div>
    );
  }

  const reviewOpen = status === "review_open";

  return (
    <div className="space-y-4">
      {isPlanner ? (
        <div className="flex flex-wrap gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <button
            type="button"
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-white dark:bg-zinc-200 dark:text-zinc-900"
            onClick={() =>
              void (async () => {
                await setEventLive(eventId);
                router.refresh();
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
                router.refresh();
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
                router.refresh();
              })()
            }
          >
            Close review & publish summary
          </button>
        </div>
      ) : null}

      {reviewOpen ? (
        <div className="flex max-h-[min(720px,85vh)] min-h-[320px] flex-col overflow-hidden rounded-xl border-2 border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/25">
          <div className="shrink-0 border-b border-emerald-200 px-4 py-3 dark:border-emerald-900">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Group review
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              This event is in review — share your honest take. Be constructive;
              see community guidelines.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {myContribution ? (
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                You submitted your review. Thanks.
              </p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void (async () => {
                    setBusy(true);
                    setErr(null);
                    try {
                      await submitContribution(eventId, revBody, revRating);
                      setRevBody("");
                      await reload();
                      router.refresh();
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
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {busy ? "Submitting…" : "Submit review"}
                </button>
              </form>
            )}
            <ul className="mt-6 space-y-2 border-t border-emerald-200/80 pt-4 text-sm text-zinc-600 dark:border-emerald-900 dark:text-zinc-400">
              <li className="text-xs font-medium uppercase text-zinc-500">
                Submissions ({contributions.length})
              </li>
              {contributions.map((c) => (
                <li key={c.user_id}>
                  {c.user_id === myUserId ? "You" : "Member"} — {c.rating}/5
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
        <div className="flex max-h-[min(560px,70vh)] min-h-[280px] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Event chat
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              Only the event creator can post updates. Everyone in the event can
              react with emoji.
            </p>
          </div>
          <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <li className="text-sm text-zinc-500">
                No messages yet.{isPlanner ? " Post an update below." : ""}
              </li>
            ) : (
              messages.map((msg) => (
                <li
                  key={msg.id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/50"
                >
                  <div className="text-xs uppercase text-zinc-500">
                    {msg.kind === "planner_broadcast"
                      ? "Planner"
                      : msg.kind}
                  </div>
                  <p className="mt-1 text-zinc-900 dark:text-zinc-100">
                    {msg.body}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        className="rounded border border-zinc-200 px-2 py-0.5 text-sm dark:border-zinc-700"
                        onClick={() => void onReact(msg.id, em)}
                      >
                        {em}{" "}
                        {reactionCount.get(msg.id)?.get(em) ?? 0}
                      </button>
                    ))}
                  </div>
                </li>
              ))
            )}
          </ul>
          {isPlanner ? (
            <form
              onSubmit={(e) => void onBroadcast(e)}
              className="shrink-0 border-t border-zinc-200 p-3 dark:border-zinc-800"
            >
              <textarea
                value={broadcast}
                onChange={(e) => setBroadcast(e.target.value)}
                placeholder="Updates for everyone — logistics, timing, meeting spot…"
                rows={3}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
              />
              <button
                type="submit"
                disabled={busy}
                className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Send
              </button>
            </form>
          ) : null}
        </div>
      )}

      {!reviewOpen ? (
        <details className="rounded-xl border border-zinc-200 dark:border-zinc-800">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Polls (optional)
          </summary>
          <div className="border-t border-zinc-200 px-4 pb-4 pt-2 dark:border-zinc-800">
            {polls.map((poll) => (
              <PollBlock key={poll.id} poll={poll} onVote={onVote} />
            ))}
            {isPlanner ? (
              <form
                onSubmit={(e) => void onCreatePoll(e)}
                className="mt-4 space-y-2"
              >
                <input
                  value={pollQ}
                  onChange={(e) => setPollQ(e.target.value)}
                  placeholder="Question"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                />
                <textarea
                  value={pollOpts}
                  onChange={(e) => setPollOpts(e.target.value)}
                  placeholder="One option per line"
                  rows={3}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white dark:bg-zinc-200 dark:text-zinc-900"
                >
                  Create poll
                </button>
              </form>
            ) : null}
          </div>
        </details>
      ) : null}

      {err ? (
        <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
      ) : null}

      <p className="text-sm">
        <a
          href={`/map?pin=${encodeURIComponent(pinId)}`}
          className="text-emerald-700 underline dark:text-emerald-400"
        >
          Back to pin
        </a>
      </p>
    </div>
  );
}

function PollBlock({
  poll,
  onVote,
}: {
  poll: Poll;
  onVote: (pollId: string, optionId: string) => void;
}) {
  const [votes, setVotes] = useState<
    { option_id: string; count: number }[] | null
  >(null);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const { data } = await supabase
        .from("poll_votes")
        .select("option_id")
        .eq("poll_id", poll.id);
      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        counts.set(row.option_id, (counts.get(row.option_id) ?? 0) + 1);
      }
      setVotes(
        [...counts.entries()].map(([option_id, count]) => ({
          option_id,
          count,
        })),
      );
    })();
  }, [poll.id]);

  const countMap = new Map((votes ?? []).map((v) => [v.option_id, v.count]));

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="font-medium">{poll.question}</p>
      <ul className="mt-2 space-y-1">
        {[...(poll.poll_options ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onVote(poll.id, o.id)}
                className="text-left text-sm text-emerald-700 underline dark:text-emerald-400"
              >
                {o.label_text}
              </button>
              <span className="text-xs text-zinc-500">
                {countMap.get(o.id) ?? 0} votes
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
