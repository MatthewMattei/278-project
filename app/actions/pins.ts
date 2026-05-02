"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUserWithProfile } from "@/lib/supabase/ensure-profile";
import { revalidatePath } from "next/cache";

export async function createPin(lat: number, lng: number, title: string) {
  const supabase = await createClient();
  const user = await requireUserWithProfile(supabase);

  const { data, error } = await supabase
    .from("pins")
    .insert({ lat, lng, title, created_by: user.id })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/map");
  return data.id as string;
}

/** Thread comment on a published group review (pin panel). */
export async function createReviewComment(reviewId: string, body: string) {
  const supabase = await createClient();
  const user = await requireUserWithProfile(supabase);

  const trimmed = body.trim();
  if (!trimmed) throw new Error("Comment cannot be empty");

  const { error } = await supabase.from("review_comments").insert({
    review_id: reviewId,
    author_id: user.id,
    body: trimmed,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/map");
}
