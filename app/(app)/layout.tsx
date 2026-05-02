import { AppNav } from "@/components/AppNav";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <AppNav />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {children}
      </div>
    </div>
  );
}
