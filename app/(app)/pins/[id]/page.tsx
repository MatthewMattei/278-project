import { NormReminder } from "@/components/NormReminder";
import { CreateEventForm } from "@/components/CreateEventForm";
import { IndividualReviewForm } from "@/components/IndividualReviewForm";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function PinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: pin, error: pinErr } = await supabase
    .from("pins")
    .select("id, title, lat, lng, created_by")
    .eq("id", id)
    .single();

  if (pinErr || !pin) notFound();

  const { data: reviews } = await supabase
    .from("reviews")
    .select(
      "id, scope, body, rating, stats, member_summaries, created_at, author_id, title",
    )
    .eq("pin_id", id)
    .order("created_at", { ascending: false });

  const { data: friendRows } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  const friendIds = new Set<string>();
  for (const f of friendRows ?? []) {
    friendIds.add(
      f.requester_id === user.id ? f.addressee_id : f.requester_id,
    );
  }

  const authorIds = [
    ...new Set(
      (reviews ?? []).map((r) => r.author_id).filter(Boolean) as string[],
    ),
  ];

  const { data: authors } = authorIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", authorIds)
    : { data: [] as { id: string; display_name: string }[] };

  const authorName = new Map((authors ?? []).map((a) => [a.id, a.display_name]));

  const sorted = [...(reviews ?? [])].sort((a, b) => {
    const fa =
      a.author_id && a.scope === "individual" && friendIds.has(a.author_id)
        ? 1
        : 0;
    const fb =
      b.author_id && b.scope === "individual" && friendIds.has(b.author_id)
        ? 1
        : 0;
    if (fb !== fa) return fb - fa;
    return (
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  });

  const { data: events } = await supabase
    .from("events")
    .select("id, starts_at, capacity, visibility, status, blurb, planner_id")
    .eq("pin_id", id)
    .order("starts_at", { ascending: true });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {pin.title}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
          </p>
        </div>
        <Link
          href="/map"
          className="text-sm font-medium text-emerald-700 dark:text-emerald-400"
        >
          ← Map
        </Link>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Events</h2>
        <ul className="mt-3 space-y-2">
          {(events ?? []).length === 0 ? (
            <li className="text-sm text-zinc-500">No events yet.</li>
          ) : (
            (events ?? []).map((ev) => (
              <li key={ev.id}>
                <Link
                  href={`/events/${ev.id}`}
                  className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  {new Date(ev.starts_at).toLocaleString()} — {ev.status} (
                  {ev.visibility})
                </Link>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {ev.blurb.slice(0, 120)}
                  {ev.blurb.length > 120 ? "…" : ""}
                </p>
              </li>
            ))
          )}
        </ul>
        <div className="mt-6">
          <CreateEventForm pinId={pin.id} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Reviews</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Friend reviews are shown first when you view this pin.
        </p>
        <ul className="mt-4 space-y-4">
          {sorted.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
                <span className="uppercase">{r.scope}</span>
                {r.rating != null ? (
                  <span>{Number(r.rating).toFixed(1)} / 5</span>
                ) : null}
                {r.author_id ? (
                  <span>
                    {authorName.get(r.author_id) ?? "Member"}
                    {friendIds.has(r.author_id) ? " · Friend" : ""}
                  </span>
                ) : null}
              </div>
              {r.title ? (
                <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                  {r.title}
                </p>
              ) : null}
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-zinc-800 dark:text-zinc-200">
                {r.body}
              </pre>
              {r.scope === "group" && r.member_summaries ? (
                <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <p className="text-xs font-medium uppercase text-zinc-500">
                    Individual perspectives
                  </p>
                  <ul className="mt-2 space-y-2">
                    {(r.member_summaries as { excerpt: string; rating: number; user_id: string }[]).map(
                      (m, i) => (
                        <li key={i} className="text-sm text-zinc-700 dark:text-zinc-300">
                          <span className="font-medium">{m.rating}/5</span> —{" "}
                          {m.excerpt}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900 dark:bg-amber-950/40">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Your review
        </h2>
        <NormReminder context="review" />
        <IndividualReviewForm pinId={pin.id} />
      </section>
    </div>
  );
}
