-- Deep archive for original photo uploads.
-- Working copies remain in the existing private archive-media bucket.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'archive-originals',
  'archive-originals',
  false,
  26214400,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists archive_originals_insert_own on storage.objects;
create policy archive_originals_insert_own
on storage.objects for insert
to authenticated
with check (
  bucket_id='archive-originals'
  and private.is_active_user()
  and private.current_role() in ('editor','admin')
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists archive_originals_read_editors on storage.objects;
create policy archive_originals_read_editors
on storage.objects for select
to authenticated
using (
  bucket_id='archive-originals'
  and private.is_active_user()
  and private.current_role() in ('editor','admin')
);

drop policy if exists archive_originals_update_editors on storage.objects;
create policy archive_originals_update_editors
on storage.objects for update
to authenticated
using (
  bucket_id='archive-originals'
  and private.is_active_user()
  and private.current_role() in ('editor','admin')
)
with check (
  bucket_id='archive-originals'
  and private.is_active_user()
  and private.current_role() in ('editor','admin')
);

drop policy if exists archive_originals_delete_editors on storage.objects;
create policy archive_originals_delete_editors
on storage.objects for delete
to authenticated
using (
  bucket_id='archive-originals'
  and private.is_active_user()
  and private.current_role() in ('editor','admin')
);
