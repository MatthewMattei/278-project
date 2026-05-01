import { AcceptFriendButton } from "@/components/AcceptFriendButton";
import { FriendSearch } from "@/components/FriendSearch";
import { createClient } from "@/lib/supabase/server";

export default async function FriendsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: friendships } = await supabase
    .from("friendships")
    .select("id, status, requester_id, addressee_id, created_at")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  const rows = friendships ?? [];
  const otherIds = [
    ...new Set(
      rows.flatMap((f) =>
        f.requester_id === user.id ? [f.addressee_id] : [f.requester_id],
      ),
    ),
  ];

  const { data: profiles } = otherIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", otherIds)
    : { data: [] as { id: string; display_name: string }[] };

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Friends
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Search by display name to send a request. Accept pending requests
        below.
      </p>

      <div className="mt-8">
        <FriendSearch currentUserId={user.id} />
      </div>

      <ul className="mt-10 space-y-3">
        {rows.length === 0 ? (
          <li className="text-sm text-zinc-500">No friendships yet.</li>
        ) : (
          rows.map((f) => {
            const otherId =
              f.requester_id === user.id ? f.addressee_id : f.requester_id;
            const incoming =
              f.status === "pending" && f.addressee_id === user.id;
            return (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div>
                  <span className="font-medium">
                    {nameById.get(otherId) ?? otherId.slice(0, 8) + "…"}
                  </span>
                  <span className="ml-2 text-xs uppercase text-zinc-500">
                    {f.status}
                  </span>
                </div>
                {incoming ? <AcceptFriendButton friendshipId={f.id} /> : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
