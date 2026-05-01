import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/notifications";
import { NotificationsClient } from "@/components/NotificationsClient";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows } = await supabase
    .from("notifications")
    .select("id, type, payload, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Notifications
        </h1>
        <form action={markAllNotificationsRead}>
          <button
            type="submit"
            className="text-sm font-medium text-emerald-700 dark:text-emerald-400"
          >
            Mark all read
          </button>
        </form>
      </div>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Friend reviews and future alerts appear here. Realtime updates while this
        tab is open.
      </p>
      <NotificationsClient
        initialRows={(rows ?? []) as never}
        userId={user.id}
        markRead={markNotificationRead}
      />
    </div>
  );
}
