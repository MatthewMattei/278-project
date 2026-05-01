import { createAdminClient } from "@/lib/supabase/admin";

/** Idempotent: builds group review from contributions and marks event completed. */
export async function amalgamateEventReview(eventId: string) {
  const admin = createAdminClient();

  const { data: event, error: evErr } = await admin
    .from("events")
    .select("id, pin_id, status")
    .eq("id", eventId)
    .single();

  if (evErr || !event) throw new Error(evErr?.message ?? "Event not found");
  if (event.status !== "review_open") {
    return { skipped: true as const, reason: "not_review_open" };
  }

  const { data: existing } = await admin
    .from("reviews")
    .select("id")
    .eq("source_event_id", eventId)
    .eq("scope", "group")
    .maybeSingle();

  if (existing) {
    await admin.from("events").update({ status: "completed" }).eq("id", eventId);
    return { skipped: true as const, reason: "already_published" };
  }

  const { data: contribs, error: cErr } = await admin
    .from("review_contributions")
    .select("user_id, body, rating")
    .eq("event_id", eventId);

  if (cErr) throw new Error(cErr.message);

  const list = contribs ?? [];
  const count = list.length;
  const avg =
    count > 0
      ? list.reduce((s, c) => s + c.rating, 0) / count
      : null;

  const distribution: Record<string, number> = {};
  for (const c of list) {
    const k = String(c.rating);
    distribution[k] = (distribution[k] ?? 0) + 1;
  }

  const member_summaries = list.map((c) => ({
    user_id: c.user_id,
    excerpt: c.body.slice(0, 500),
    rating: c.rating,
  }));

  const bullets = list.map(
    (c) => `• (${c.rating}/5) ${c.body.slice(0, 120)}${c.body.length > 120 ? "…" : ""}`,
  );
  const summaryBody =
    count === 0
      ? "No contributions were submitted during this review window."
      : `Group visit summary (n=${count}, avg ${avg?.toFixed(2)}/5):\n${bullets.join("\n")}`;

  const { error: insErr } = await admin.from("reviews").insert({
    pin_id: event.pin_id,
    scope: "group",
    source_event_id: eventId,
    author_id: null,
    body: summaryBody,
    rating: avg,
    stats: { avg, count, distribution },
    member_summaries,
    title: "Group review",
  });

  if (insErr) throw new Error(insErr.message);

  const { error: upErr } = await admin
    .from("events")
    .update({ status: "completed" })
    .eq("id", eventId);

  if (upErr) throw new Error(upErr.message);

  return { skipped: false as const, contributions: count };
}
