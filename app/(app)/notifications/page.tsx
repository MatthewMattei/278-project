import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rows =
    user != null
      ? (
          await supabase
            .from("notifications")
            .select("id, type, payload, read_at, created_at")
            .order("created_at", { ascending: false })
            .limit(50)
        ).data
      : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="rounded-3xl border border-white/35 bg-white/92 p-6 shadow-[0_24px_64px_rgba(15,23,42,0.12)] backdrop-blur-md dark:border-zinc-600 dark:bg-zinc-900/82 sm:p-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Notifications
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Updates tied to your account. Open the map to jump back into places
          and events.
        </p>

        {!user ? (
          <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
            <Link
              href="/login"
              className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
            >
              Sign in
            </Link>{" "}
            to see notifications.
          </p>
        ) : !rows?.length ? (
          <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
            No notifications yet.
          </p>
        ) : (
          <ul className="mt-8 space-y-3">
            {rows.map((n) => {
              const payload = n.payload as Record<string, unknown> | null;
              const pinId =
                typeof payload?.pin_id === "string" ? payload.pin_id : null;
              const href = pinId
                ? `/map?pin=${encodeURIComponent(pinId)}`
                : "/map";
              return (
                <li
                  key={n.id}
                  className="rounded-2xl border border-zinc-200/80 bg-white/60 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {n.type.replace(/_/g, " ")}
                    </span>
                    <time
                      className="text-xs text-zinc-500"
                      dateTime={n.created_at}
                    >
                      {new Date(n.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  {n.read_at ? (
                    <p className="mt-1 text-xs text-zinc-500">Read</p>
                  ) : null}
                  {pinId ? (
                    <Link
                      href={href}
                      className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      View on map
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-8">
          <Link
            href="/map"
            className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Back to map
          </Link>
        </p>
      </div>
    </div>
  );
}
