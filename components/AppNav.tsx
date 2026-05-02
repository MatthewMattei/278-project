import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";

export async function AppNav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/map"
          className="text-lg font-semibold text-emerald-700 dark:text-emerald-400"
        >
          PinTogether
        </Link>
        <nav className="flex flex-wrap items-center gap-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          <Link
            href="/map"
            className="hover:text-emerald-700 dark:hover:text-emerald-400"
          >
            Map
          </Link>
          <Link
            href="/profile"
            className="hover:text-emerald-700 dark:hover:text-emerald-400"
          >
            Profile
          </Link>
          <Link
            href="/friends"
            className="hover:text-emerald-700 dark:hover:text-emerald-400"
          >
            Friends
          </Link>
          <Link
            href="/guidelines"
            className="hover:text-emerald-700 dark:hover:text-emerald-400"
          >
            Guidelines
          </Link>
          <SignOutButton />
        </nav>
      </div>
    </header>
  );
}
