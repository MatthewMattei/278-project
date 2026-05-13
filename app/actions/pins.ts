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

export async function updatePin(
  pinId: string,
  input: { title?: string; lat?: number; lng?: number },
) {
  const supabase = await createClient();
  const user = await requireUserWithProfile(supabase);

  const { error } = await supabase
    .from("pins")
    .update(input)
    .eq("id", pinId)
    .eq("created_by", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/map");
}

export async function deletePin(pinId: string) {
  const supabase = await createClient();
  const user = await requireUserWithProfile(supabase);

  const { error } = await supabase
    .from("pins")
    .delete()
    .eq("id", pinId)
    .eq("created_by", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/map");
}

/** Threaded comment on a published group review. */
export async function createReviewComment(input: {
  reviewId: string;
  body: string;
  parentId?: string | null;
  threadAnchorUserId?: string | null;
}) {
  const supabase = await createClient();
  const user = await requireUserWithProfile(supabase);

  const trimmed = input.body.trim();
  if (!trimmed) throw new Error("Comment cannot be empty");

  const row: Record<string, unknown> = {
    review_id: input.reviewId,
    author_id: user.id,
    body: trimmed,
  };
  if (input.parentId) row.parent_id = input.parentId;
  if (input.threadAnchorUserId && !input.parentId) {
    row.thread_anchor_user_id = input.threadAnchorUserId;
  }

  const { error } = await supabase.from("review_comments").insert(row);

  if (error) throw new Error(error.message);
  revalidatePath("/map");
}

export async function updateReviewComment(commentId: string, body: string) {
  const supabase = await createClient();
  const user = await requireUserWithProfile(supabase);
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Comment cannot be empty");

  const { error } = await supabase
    .from("review_comments")
    .update({ body: trimmed })
    .eq("id", commentId)
    .eq("author_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/map");
}

export async function deleteReviewComment(commentId: string) {
  const supabase = await createClient();
  const user = await requireUserWithProfile(supabase);

  const { error } = await supabase
    .from("review_comments")
    .delete()
    .eq("id", commentId)
    .eq("author_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/map");
}

export async function updateGroupReview(
  reviewId: string,
  input: {
    title?: string | null;
    body?: string;
    host_photo_url?: string | null;
  },
) {
  const supabase = await createClient();
  await requireUserWithProfile(supabase);

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.body !== undefined) patch.body = input.body;
  if (input.host_photo_url !== undefined)
    patch.host_photo_url = input.host_photo_url;

  const { error } = await supabase
    .from("reviews")
    .update(patch)
    .eq("id", reviewId)
    .eq("scope", "group");

  if (error) throw new Error(error.message);
  revalidatePath("/map");
}

export async function deleteGroupReview(reviewId: string) {
  const supabase = await createClient();
  await requireUserWithProfile(supabase);

  const { error } = await supabase
    .from("reviews")
    .delete()
    .eq("id", reviewId)
    .eq("scope", "group");

  if (error) throw new Error(error.message);
  revalidatePath("/map");
}
