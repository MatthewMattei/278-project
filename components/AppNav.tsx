import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";

export async function AppNav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const linkClass =
    "inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-emerald-50 hover:text-emerald-800 dark:text-zinc-200 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-300";

  return (
    <header className="shrink-0 border-b border-white/35 bg-white/92 shadow-[0_8px_32px_rgba(15,23,42,0.06)] backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/88">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/map"
          className="text-lg font-semibold tracking-tight text-emerald-800 dark:text-emerald-300"
        >
          PinTogether
        </Link>
        <nav className="flex flex-wrap items-center gap-1 rounded-2xl border border-zinc-200/80 bg-white/50 p-1 dark:border-zinc-700 dark:bg-zinc-900/40">
          <Link href="/map" className={linkClass}>
            Map
          </Link>
          <Link href="/profile" className={linkClass}>
            Profile
          </Link>
          <Link href="/friends" className={linkClass}>
            Friends
          </Link>
          <Link href="/notifications" className={linkClass}>
            Alerts
          </Link>
          <Link href="/guidelines" className={linkClass}>
            Guidelines
          </Link>
          <span className="inline-flex items-center pl-1">
            <SignOutButton />
          </span>
        </nav>
      </div>
    </header>
  );
}
