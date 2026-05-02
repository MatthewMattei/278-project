import { loadEventRoomPayload } from "@/lib/events/event-room-data";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

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

  const result = await loadEventRoomPayload(supabase, eventId, user.id);
  if (!result.ok) {
    redirect("/map");
  }

  const pinId = result.data.event.pin_id;

  if (result.data.event.status === "completed") {
    const { data: rev } = await supabase
      .from("reviews")
      .select("id")
      .eq("pin_id", pinId)
      .eq("scope", "group")
      .eq("source_event_id", eventId)
      .maybeSingle();
    if (rev?.id) {
      redirect(
        `/map?pin=${encodeURIComponent(pinId)}&review=${encodeURIComponent(rev.id)}`,
      );
    }
    redirect(`/map?pin=${encodeURIComponent(pinId)}`);
  }

  redirect(
    `/map?pin=${encodeURIComponent(pinId)}&event=${encodeURIComponent(eventId)}`,
  );
}
