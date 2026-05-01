-- Optional seed for injunctive norms (run in Supabase SQL editor after signup).
-- 1. Sign up once, then copy your user id from Profile.
-- 2. Replace YOUR_USER_ID below and run the statements.

/*
insert into public.pins (lat, lng, title, created_by)
values
  (37.7849, -122.4094, 'Example: Casual lunch — budget ~$15/person', 'YOUR_USER_ID'),
  (37.7694, -122.4862, 'Example: Meet at the park entrance (pin) before walking', 'YOUR_USER_ID');

insert into public.reviews (pin_id, scope, author_id, title, body, rating)
select id, 'individual', 'YOUR_USER_ID',
  'Thoughtful sample review',
  'We spent about $40 for two. Staff were busy but friendly. Good for a quick group stop — confirm hours before you go.',
  4
from public.pins
where title like 'Example:%'
limit 1;
*/

-- Uncomment and edit YOUR_USER_ID to seed example pins and one individual review.
