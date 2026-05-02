import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

/**
 * `events.planner_id` and `pins.created_by` reference `profiles.id`. A row is
 * normally created by `handle_new_user` on signup; this covers missing rows.
 */
export async function ensureProfile(
  supabase: SupabaseClient,
  user: User,
): Promise<void> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (data) return;

  const meta = user.user_metadata as { full_name?: string } | undefined;
  const displayName =
    meta?.full_name?.trim() ||
    (user.email ? user.email.split("@")[0] : null) ||
    "User";

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    display_name: displayName,
  });
  if (error) throw new Error(error.message);
}

/** Use before any write that FK-references `profiles` (events, pins, event_members, etc.). */
export async function requireUserWithProfile(
  supabase: SupabaseClient,
): Promise<User> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  await ensureProfile(supabase, user);
  return user;
}
