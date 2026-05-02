import { FriendCodeCopy } from "@/components/FriendCodeCopy";
import { ProfileForm } from "@/components/ProfileForm";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, friend_code")
    .eq("id", user.id)
    .single();

  const friendCode = profile?.friend_code ?? "";

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <div className="rounded-3xl border border-white/35 bg-white/92 p-6 shadow-[0_24px_64px_rgba(15,23,42,0.12)] backdrop-blur-md dark:border-zinc-600 dark:bg-zinc-900/82 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/95 dark:text-emerald-300">
          Your account
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Profile
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Share your friend code so others can send you a request.
        </p>
        <div className="mt-4">
          <FriendCodeCopy code={friendCode} />
        </div>
        <div className="mt-8">
          <ProfileForm initialDisplayName={profile?.display_name ?? ""} />
        </div>
      </div>
    </div>
  );
}
