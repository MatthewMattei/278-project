import { joinPrivateEventFromForm } from "@/app/actions/events";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t: token } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/join?t=${token ?? ""}`)}`);
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-xl font-semibold">Invite link</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Missing token. Ask the planner for the full invite URL.
        </p>
        <Link href="/login" className="mt-4 inline-block text-emerald-700 underline">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-xl font-semibold">Join private event</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Confirm to join with your account.
      </p>
      <form className="mt-6" action={joinPrivateEventFromForm}>
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
        >
          Join event
        </button>
      </form>
    </div>
  );
}
