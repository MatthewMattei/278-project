import { amalgamateEventReview } from "@/lib/reviews/amalgamate";
import { createAdminClient } from "@/lib/supabase/admin";

/** Vercel Hobby allows at most daily crons — schedule is 12:00 UTC (see vercel.json). Auto-close may lag until the next run; planners can still close manually. */

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: due, error } = await admin
    .from("events")
    .select("id")
    .eq("status", "review_open")
    .not("review_closes_at", "is", null)
    .lte("review_closes_at", now);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let processed = 0;
  const failures: { id: string; message: string }[] = [];
  for (const row of due ?? []) {
    try {
      await amalgamateEventReview(row.id);
      processed += 1;
    } catch (e) {
      failures.push({
        id: row.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return Response.json({
    processed,
    checked: due?.length ?? 0,
    failures,
  });
}
