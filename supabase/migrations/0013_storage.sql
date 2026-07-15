-- Storage buckets, keyed by path convention {user_id}/filename so a single
-- storage.foldername(name) check enforces per-user ownership everywhere.

insert into storage.buckets (id, name, public)
values
  ('verification-screenshots', 'verification-screenshots', false),
  ('avatars', 'avatars', true),
  ('producer-docs', 'producer-docs', false)
on conflict (id) do nothing;

-- verification-screenshots: never public, owner-only in every direction.
-- This is where the Privacy Policy section 5 retention rule physically
-- lives - deleting/replacing the object is a plain client-side storage call
-- since the owner has full rights to their own folder.
create policy "verification_screenshots_owner_all"
on storage.objects for all
using (bucket_id = 'verification-screenshots' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'verification-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);

-- avatars: public read (shown to other users per Privacy Policy section 10),
-- owner-only write.
create policy "avatars_public_read"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "avatars_owner_insert" on storage.objects for insert
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_owner_update" on storage.objects for update
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_owner_delete" on storage.objects for delete
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- producer-docs: never public, used only for manual verification review.
create policy "producer_docs_owner_all"
on storage.objects for all
using (bucket_id = 'producer-docs' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'producer-docs' and (storage.foldername(name))[1] = auth.uid()::text);
