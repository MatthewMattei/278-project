"use server";

import { amalgamateEventReview } from "@/lib/reviews/amalgamate";
import { createClient } from "@/lib/supabase/server";
import { requireUserWithProfile } from "@/lib/supabase/ensure-profile";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createEvent(input: {
  pinId: string;
  startsAt: string;
  capacity: number;
  visibility: "public" | "private";
  blurb: string;
}) {
  const supabase = await createClient();
  const user = await requireUserWithProfile(supabase);

  const { data, error } = await supabase
    .from("events")
    .insert({
      pin_id: input.pinId,
      planner_id: user.id,
      starts_at: input.startsAt,
      capacity: input.capacity,
      visibility: input.visibility,
      blurb: input.blurb,
      status: "scheduled",
    })
    .select("id, invite_token")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/map");
  revalidatePath(`/events/${data.id}`);
  return data as { id: string; invite_token: string };
}

export async function joinPublicEvent(eventId: string) {
  const supabase = await createClient();
  await requireUserWithProfile(supabase);
  const { data, error } = await supabase.rpc("join_public_event", {
    p_event_id: eventId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/events/${eventId}`);
  return data;
}

export async function joinPrivateEvent(token: string) {
  const supabase = await createClient();
  await requireUserWithProfile(supabase);
  const { data, error } = await supabase.rpc("join_private_event", {
    p_token: token,
  });
  if (error) throw new Error(error.message);
  const row = data as { event_id?: string } | null;
  if (row?.event_id) {
    revalidatePath(`/events/${row.event_id}`);
  }
  return data;
}

export async function joinPrivateEventFromForm(formData: FormData) {
  const token = formData.get("token");
  if (typeof token !== "string" || !token) {
    throw new Error("Missing token");
  }
  const data = await joinPrivateEvent(token);
  const row = data as { event_id?: string } | null;
  if (row?.event_id) {
    const supabase = await createClient();
    const { data: ev } = await supabase
      .from("events")
      .select("pin_id")
      .eq("id", row.event_id)
      .single();
    const pinId = (ev as { pin_id: string } | null)?.pin_id;
    if (pinId) {
      redirect(
        `/map?pin=${encodeURIComponent(pinId)}&event=${encodeURIComponent(row.event_id)}`,
      );
    }
    redirect(`/events/${row.event_id}`);
  }
  redirect("/map");
}

export async function setEventLive(eventId: string) {
  const supabase = await createClient();
  const user = await requireUserWithProfile(supabase);

  const { error } = await supabase
    .from("events")
    .update({ status: "live" })
    .eq("id", eventId)
    .eq("planner_id", user.id)
    .in("status", ["scheduled", "live"]);

  if (error) throw new Error(error.message);
  revalidatePath(`/events/${eventId}`);
}

export async function openReviewWindow(eventId: string) {
  const supabase = await createClient();
  const user = await requireUserWithProfile(supabase);

  const closes = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("events")
    .update({
      status: "review_open",
      review_opens_at: new Date().toISOString(),
      review_closes_at: closes,
    })
    .eq("id", eventId)
    .eq("planner_id", user.id)
    .in("status", ["scheduled", "live"]);

  if (error) throw new Error(error.message);

  const { error: sysErr } = await supabase.from("event_messages").insert({
    event_id: eventId,
    author_id: user.id,
    body: "The review window is open. Share your honest take — be kind to local staff in your wording.",
    kind: "system",
  });

  if (sysErr) {
    // RLS may block system messages from client — ignore if fails
    console.warn("system message insert:", sysErr.message);
  }

  revalidatePath(`/events/${eventId}`);
}

export async function closeReviewManually(eventId: string) {
  const supabase = await createClient();
  const user = await requireUserWithProfile(supabase);

  const { data: ev } = await supabase
    .from("events")
    .select("planner_id, status")
    .eq("id", eventId)
    .single();

  if (!ev || ev.planner_id !== user.id) throw new Error("Forbidden");
  if (ev.status !== "review_open") throw new Error("Review not open");

  await amalgamateEventReview(eventId);

  const { data: pinRow } = await supabase
    .from("events")
    .select("pin_id")
    .eq("id", eventId)
    .single();

  if (pinRow?.pin_id) {
    revalidatePath("/map");
  }
  revalidatePath(`/events/${eventId}`);
}

export async function submitContribution(
  eventId: string,
  body: string,
  rating: number,
) {
  const supabase = await createClient();
  const user = await requireUserWithProfile(supabase);

  const { error } = await supabase.from("review_contributions").insert({
    event_id: eventId,
    user_id: user.id,
    body,
    rating,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/events/${eventId}`);
}

export async function postPlannerBroadcast(eventId: string, body: string) {
  const supabase = await createClient();
  const user = await requireUserWithProfile(supabase);

  const { error } = await supabase.from("event_messages").insert({
    event_id: eventId,
    author_id: user.id,
    body,
    kind: "planner_broadcast",
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/events/${eventId}`);
}

export async function addReaction(messageId: string, emoji: string) {
  const supabase = await createClient();
  const user = await requireUserWithProfile(supabase);

  const { error } = await supabase.from("message_reactions").insert({
    message_id: messageId,
    user_id: user.id,
    emoji,
  });

  if (error && !error.message.includes("duplicate")) {
    throw new Error(error.message);
  }
}

export async function createPoll(input: {
  eventId: string;
  question: string;
  options: string[];
}) {
  const supabase = await createClient();
  const user = await requireUserWithProfile(supabase);

  const { data: poll, error: pErr } = await supabase
    .from("polls")
    .insert({
      event_id: input.eventId,
      question: input.question,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (pErr) throw new Error(pErr.message);

  const rows = input.options.map((label_text, i) => ({
    poll_id: poll.id,
    label_text,
    sort_order: i,
  }));

  const { error: oErr } = await supabase.from("poll_options").insert(rows);
  if (oErr) throw new Error(oErr.message);
  revalidatePath(`/events/${input.eventId}`);
}

export async function votePoll(pollId: string, optionId: string) {
  const supabase = await createClient();
  const user = await requireUserWithProfile(supabase);

  const { error } = await supabase.from("poll_votes").upsert(
    {
      poll_id: pollId,
      option_id: optionId,
      user_id: user.id,
    },
    { onConflict: "poll_id,user_id" },
  );

  if (error) throw new Error(error.message);
}
