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

  redirect(
    `/map?pin=${encodeURIComponent(result.data.event.pin_id)}&event=${encodeURIComponent(eventId)}`,
  );
}
