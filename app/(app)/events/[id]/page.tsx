import { EventRoom } from "@/components/EventRoom";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: event, error } = await supabase
    .from("events")
    .select(
      "id, pin_id, planner_id, starts_at, capacity, visibility, status, blurb, invite_token",
    )
    .eq("id", eventId)
    .single();

  if (error || !event) notFound();

  const { data: membership } = await supabase
    .from("event_members")
    .select("role")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();

  const isMember = !!membership;
  const isPlanner = event.planner_id === user.id;

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
      : { data: [] as { message_id: string; user_id: string; emoji: string }[] };

  const { data: polls } = await supabase
    .from("polls")
    .select("id, question, poll_options(id, label_text, sort_order)")
    .eq("event_id", eventId);

  const { data: contributions } = await supabase
    .from("review_contributions")
    .select("user_id, body, rating")
    .eq("event_id", eventId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Event
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {new Date(event.starts_at).toLocaleString()} · {event.status} ·{" "}
            {event.visibility}
          </p>
          <p className="mt-2 text-zinc-800 dark:text-zinc-200">{event.blurb}</p>
          {event.visibility === "private" && isPlanner ? (
            <p className="mt-2 break-all text-xs text-zinc-500">
              Invite: {`/join?t=${event.invite_token}`}
            </p>
          ) : null}
        </div>
        <Link
          href={`/pins/${event.pin_id}`}
          className="text-sm font-medium text-emerald-700 dark:text-emerald-400"
        >
          View pin
        </Link>
      </div>

      <div className="mt-8">
        <EventRoom
          eventId={eventId}
          pinId={event.pin_id}
          status={event.status}
          visibility={event.visibility}
          initialMessages={(messages ?? []) as never}
          initialReactions={(reactions ?? []) as never}
          initialPolls={(polls ?? []) as never}
          isPlanner={isPlanner}
          isMember={isMember}
          myUserId={user.id}
          initialContributions={(contributions ?? []) as never}
        />
      </div>
    </div>
  );
}
