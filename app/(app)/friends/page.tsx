import { AcceptFriendButton } from "@/components/AcceptFriendButton";
import { AvatarImg } from "@/components/AvatarImg";
import { FriendSearch } from "@/components/FriendSearch";
import { RemoveFriendButton } from "@/components/RemoveFriendButton";
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
        .select("id, display_name, avatar_url")
        .in("id", otherIds)
    : { data: [] as { id: string; display_name: string; avatar_url: string | null }[] };

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="rounded-3xl border border-white/35 bg-white/92 p-6 shadow-[0_24px_64px_rgba(15,23,42,0.12)] backdrop-blur-md dark:border-zinc-600 dark:bg-zinc-900/82 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/95 dark:text-emerald-300">
          People you know
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Friends
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Add someone by the friend code from their profile. Accept pending
          requests below.
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
              const op = profileById.get(otherId);
              return (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200/80 bg-white/70 p-4 dark:border-zinc-700 dark:bg-zinc-900/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <AvatarImg
                      src={op?.avatar_url}
                      alt={op?.display_name ?? "Friend"}
                      size={40}
                    />
                    <div className="min-w-0">
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">
                        {op?.display_name ?? otherId.slice(0, 8) + "…"}
                      </span>
                      <span className="ml-2 text-xs uppercase tracking-wide text-zinc-500">
                        {f.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {incoming ? <AcceptFriendButton friendshipId={f.id} /> : null}
                    {f.status === "accepted" ? (
                      <RemoveFriendButton friendshipId={f.id} />
                    ) : null}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
