import type { SupabaseClient } from "@supabase/supabase-js";

export type EventRoomMessage = {
  id: string;
  body: string;
  kind: string;
  author_id: string;
  created_at: string;
};

export type EventRoomReaction = {
  message_id: string;
  user_id: string;
  emoji: string;
};

export type EventRoomPollOption = {
  id: string;
  label_text: string;
  sort_order: number;
};

export type EventRoomPoll = {
  id: string;
  question: string;
  created_at: string;
  poll_options: EventRoomPollOption[];
};

export type EventRoomContribution = {
  user_id: string;
  body: string;
  rating: number;
};

export type EventRoomPollVote = {
  poll_id: string;
  option_id: string;
  user_id: string;
};

export type EventRoomMember = {
  user_id: string;
  display_name: string;
};

export type EventRoomEventRow = {
  id: string;
  pin_id: string;
  planner_id: string;
  starts_at: string;
  capacity: number;
  visibility: string;
  status: string;
  blurb: string;
  invite_token: string | null;
  members_can_invite_friends: boolean;
};

export type PlannerProfile = {
  display_name: string;
  avatar_url: string | null;
};

export type EventRoomPayload = {
  event: EventRoomEventRow;
  plannerProfile: PlannerProfile | null;
  isMember: boolean;
  isPlanner: boolean;
  messages: EventRoomMessage[];
  reactions: EventRoomReaction[];
  polls: EventRoomPoll[];
  pollVotes: EventRoomPollVote[];
  contributions: EventRoomContribution[];
  memberRoster: EventRoomMember[];
};

export async function loadEventRoomPayload(
  supabase: SupabaseClient,
  eventId: string,
  userId: string,
): Promise<{ ok: true; data: EventRoomPayload } | { ok: false; reason: "not_found" }> {
  const { data: event, error } = await supabase
    .from("events")
    .select(
      "id, pin_id, planner_id, starts_at, capacity, visibility, status, blurb, invite_token, members_can_invite_friends",
    )
    .eq("id", eventId)
    .single();

  if (error || !event) {
    return { ok: false, reason: "not_found" };
  }

  const raw = event as Record<string, unknown>;
  const ev = {
    ...raw,
    members_can_invite_friends: Boolean(raw.members_can_invite_friends),
  } as EventRoomEventRow;

  const [
    { data: plannerRow },
    { data: membership },
    { data: messages },
    { data: polls },
    { data: contributions },
    { data: memRows },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", ev.planner_id)
      .maybeSingle(),
    supabase
      .from("event_members")
      .select("role")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("event_messages")
      .select("id, body, kind, author_id, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true }),
    supabase
      .from("polls")
      .select("id, question, created_at, poll_options(id, label_text, sort_order)")
      .eq("event_id", eventId),
    supabase
      .from("review_contributions")
      .select("user_id, body, rating")
      .eq("event_id", eventId),
    supabase.from("event_members").select("user_id").eq("event_id", eventId),
  ]);

  const plannerProfile = plannerRow
    ? (plannerRow as PlannerProfile)
    : null;

  const isMember = !!membership;
  const isPlanner = ev.planner_id === userId;

  const msgIds = (messages ?? []).map((m) => m.id);
  const pollList = (polls ?? []) as EventRoomPoll[];
  const pollIds = pollList.map((p) => p.id);

  const rosterIds = [
    ...new Set([
      ...(memRows ?? []).map((m) => m.user_id as string),
      ev.planner_id,
    ]),
  ];

  const [reactionsResult, pollVotesResult, rosterResult] = await Promise.all([
    msgIds.length > 0
      ? supabase
          .from("message_reactions")
          .select("message_id, user_id, emoji")
          .in("message_id", msgIds)
      : Promise.resolve({ data: [] as EventRoomReaction[] }),
    pollIds.length > 0
      ? supabase
          .from("poll_votes")
          .select("poll_id, option_id, user_id")
          .in("poll_id", pollIds)
      : Promise.resolve({ data: [] as EventRoomPollVote[] }),
    rosterIds.length > 0
      ? supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", rosterIds)
      : Promise.resolve({
          data: [] as { id: string; display_name: string }[],
        }),
  ]);

  const memberRoster: EventRoomMember[] = (rosterResult.data ?? []).map(
    (p) => ({
      user_id: p.id,
      display_name: p.display_name ?? "Member",
    }),
  );

  return {
    ok: true,
    data: {
      event: ev,
      plannerProfile,
      isMember,
      isPlanner,
      messages: (messages ?? []) as EventRoomMessage[],
      reactions: (reactionsResult.data ?? []) as EventRoomReaction[],
      polls: pollList,
      pollVotes: (pollVotesResult.data ?? []) as EventRoomPollVote[],
      contributions: (contributions ?? []) as EventRoomContribution[],
      memberRoster,
    },
  };
}
