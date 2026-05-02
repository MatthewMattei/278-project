"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createPin(lat: number, lng: number, title: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("pins")
    .insert({ lat, lng, title, created_by: user.id })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/map");
  return data.id as string;
}

export async function createIndividualReview(
  pinId: string,
  body: string,
  rating: number,
  title?: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("reviews").insert({
    pin_id: pinId,
    scope: "individual",
    author_id: user.id,
    body,
    rating,
    title: title ?? null,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/map");
}
