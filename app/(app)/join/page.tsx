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
      <div className="mx-auto max-w-md px-4 py-12">
        <div className="rounded-3xl border border-white/35 bg-white/92 p-6 shadow-[0_24px_64px_rgba(15,23,42,0.12)] backdrop-blur-md dark:border-zinc-600 dark:bg-zinc-900/82">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/95 dark:text-emerald-300">
            Invite
          </p>
          <h1 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Invite link
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Missing token. Ask the planner for the full invite URL.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block text-sm font-medium text-emerald-700 dark:text-emerald-400"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-3xl border border-white/35 bg-white/92 p-6 shadow-[0_24px_64px_rgba(15,23,42,0.12)] backdrop-blur-md dark:border-zinc-600 dark:bg-zinc-900/82">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/95 dark:text-emerald-300">
          Private event
        </p>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Join event
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Confirm to join with your account.
        </p>
        <form className="mt-6" action={joinPrivateEventFromForm}>
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            Join event
          </button>
        </form>
      </div>
    </div>
  );
}
