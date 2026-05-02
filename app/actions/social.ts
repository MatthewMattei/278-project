"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function sendFriendRequest(targetUserId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  if (targetUserId === user.id) throw new Error("Cannot friend yourself");

  const { error } = await supabase.from("friendships").insert({
    requester_id: user.id,
    addressee_id: targetUserId,
    status: "pending",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/friends");
}

export async function acceptFriendship(friendshipId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("friendships")
    .update({ status: "accepted" })
    .eq("id", friendshipId)
    .eq("addressee_id", user.id)
    .eq("status", "pending");

  if (error) throw new Error(error.message);
  revalidatePath("/friends");
}

export async function removeFriendship(friendshipId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId)
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  if (error) throw new Error(error.message);
  revalidatePath("/friends");
}
