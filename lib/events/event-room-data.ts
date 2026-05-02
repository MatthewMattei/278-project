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
  poll_options: EventRoomPollOption[];
};

export type EventRoomContribution = {
  user_id: string;
  body: string;
  rating: number;
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
};

export type EventRoomPayload = {
  event: EventRoomEventRow;
  isMember: boolean;
  isPlanner: boolean;
  messages: EventRoomMessage[];
  reactions: EventRoomReaction[];
  polls: EventRoomPoll[];
  contributions: EventRoomContribution[];
};

export async function loadEventRoomPayload(
  supabase: SupabaseClient,
  eventId: string,
  userId: string,
): Promise<{ ok: true; data: EventRoomPayload } | { ok: false; reason: "not_found" }> {
  const { data: event, error } = await supabase
    .from("events")
    .select(
      "id, pin_id, planner_id, starts_at, capacity, visibility, status, blurb, invite_token",
    )
    .eq("id", eventId)
    .single();

  if (error || !event) {
    return { ok: false, reason: "not_found" };
  }

  const ev = event as EventRoomEventRow;

  const { data: membership } = await supabase
    .from("event_members")
    .select("role")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();

  const isMember = !!membership;
  const isPlanner = ev.planner_id === userId;

  const { data: messages } = await supabase
    .from("event_messages")
    .select("id, body, kind, author_id, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  const msgIds = (messages ?? []).map((m) => m.id);

  const { data: reactions } =
    msgIds.length > 0
      ? await supabase
          .from("message_reactions")
          .select("message_id, user_id, emoji")
          .in("message_id", msgIds)
      : { data: [] as EventRoomReaction[] };

  const { data: polls } = await supabase
    .from("polls")
    .select("id, question, poll_options(id, label_text, sort_order)")
    .eq("event_id", eventId);

  const { data: contributions } = await supabase
    .from("review_contributions")
    .select("user_id, body, rating")
    .eq("event_id", eventId);

  return {
    ok: true,
    data: {
      event: ev,
      isMember,
      isPlanner,
      messages: (messages ?? []) as EventRoomMessage[],
      reactions: (reactions ?? []) as EventRoomReaction[],
      polls: (polls ?? []) as EventRoomPoll[],
      contributions: (contributions ?? []) as EventRoomContribution[],
    },
  };
}
