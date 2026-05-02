"use client";

import { AvatarImg } from "@/components/AvatarImg";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProfileForm({
  initialDisplayName,
  initialAvatarUrl,
}: {
  initialDisplayName: string;
  initialAvatarUrl?: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialDisplayName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg("Saved.");
    router.refresh();
  }

  async function onAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setMsg(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const ext = file.type.includes("png")
      ? "png"
      : file.type.includes("webp")
        ? "webp"
        : "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setMsg(upErr.message);
      return;
    }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const publicUrl = pub.publicUrl;
    const { error: prErr } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", user.id);
    if (prErr) {
      setMsg(prErr.message);
      return;
    }
    setAvatarUrl(publicUrl);
    setMsg("Photo updated.");
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-4">
      <div>
        <p className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Profile photo
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <AvatarImg src={avatarUrl} alt={name || "You"} size={72} />
          <label className="cursor-pointer rounded-xl border border-zinc-200/90 bg-white/70 px-4 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-200">
            Upload image
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => void onAvatarPick(e)}
            />
          </label>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          JPEG, PNG, or Webp. Shown next to your name for friends and on events
          you host.
        </p>
      </div>
      <div>
        <label
          htmlFor="display_name"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Display name
        </label>
        <input
          id="display_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-xl border border-zinc-200/90 bg-white/70 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/50"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      {msg ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{msg}</p> : null}
    </form>
  );
}
