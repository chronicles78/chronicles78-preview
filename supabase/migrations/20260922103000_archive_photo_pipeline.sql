-- Photo archive pipeline.
-- Original uploads are kept separately from the lightweight working archive.
-- Member submissions are moderated before they can enter archive_media.

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

create table if not exists public.photo_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  approx_date_text text,
  location_text text,
  people_note text,
  source_note text,
  permission_confirmed boolean not null default false,
  original_storage_path text not null,
  preview_storage_path text not null,
  original_file_name text,
  original_file_size bigint,
  source_width integer,
  source_height integer,
  preview_width integer,
  preview_height integer,
  preview_file_size bigint,
  preview_format text,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected')),
  media_id text references public.archive_media(id) on delete set null,
  moderator_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.photo_submissions enable row level security;

revoke all on public.photo_submissions from anon;
revoke insert,update,delete on public.photo_submissions from authenticated;
grant select on public.photo_submissions to authenticated;

drop policy if exists photo_submissions_select on public.photo_submissions;
create policy photo_submissions_select
on public.photo_submissions for select
to authenticated
using (
  private.is_active_user()
  and (
    submitted_by=(select auth.uid())
    or private.current_role() in ('editor','admin')
  )
);

create index if not exists photo_submissions_status_created_idx
  on public.photo_submissions(status,created_at);
create index if not exists photo_submissions_submitter_created_idx
  on public.photo_submissions(submitted_by,created_at desc);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'archive-pending',
  'archive-pending',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists archive_pending_insert_own on storage.objects;
create policy archive_pending_insert_own
on storage.objects for insert
to authenticated
with check (
  bucket_id='archive-pending'
  and private.is_active_user()
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists archive_pending_select_own_or_moderator on storage.objects;
create policy archive_pending_select_own_or_moderator
on storage.objects for select
to authenticated
using (
  bucket_id='archive-pending'
  and private.is_active_user()
  and (
    (storage.foldername(name))[1]=(select auth.uid())::text
    or private.current_role() in ('editor','admin')
  )
);

drop policy if exists archive_pending_delete_moderators on storage.objects;
create policy archive_pending_delete_moderators
on storage.objects for delete
to authenticated
using (
  bucket_id='archive-pending'
  and private.is_active_user()
  and private.current_role() in ('editor','admin')
);
