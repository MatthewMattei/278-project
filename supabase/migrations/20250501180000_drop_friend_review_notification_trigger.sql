-- In-app notifications are removed; stop inserting rows when friends post pin reviews.
drop trigger if exists tr_notify_friends_review on public.reviews;
drop function if exists public.notify_friends_new_review();
