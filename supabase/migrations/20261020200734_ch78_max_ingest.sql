-- CH78-MAX-001: isolated server-only MAX archive, no access from website roles.
-- Apply only to fnwpkmjjdhflnqghnogj after acceptance; no existing objects changed.
begin;
create table public.ch78_max_messages (
  chat_id text not null check (chat_id ~ '^-?[1-9][0-9]{0,15}$'),
  message_id text not null check (length(message_id) between 1 and 512),
  message_ts bigint not null check (message_ts >= 0),
  event_ts bigint not null check (event_ts >= 0),
  text text not null default '',
  sender jsonb check (sender is null or jsonb_typeof(sender) = 'object'),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  linked_message jsonb check (linked_message is null or jsonb_typeof(linked_message) = 'object'),
  source_message jsonb not null check (jsonb_typeof(source_message) = 'object'),
  received_at timestamptz not null default now(),
  primary key (chat_id, message_id)
);
create index ch78_max_messages_time on public.ch78_max_messages(chat_id, message_ts, message_id);
alter table public.ch78_max_messages enable row level security;
alter table public.ch78_max_messages force row level security;
-- Override default Supabase grants. There are deliberately NO client policies.
revoke all on public.ch78_max_messages from public, anon, authenticated, service_role;
grant select, insert on public.ch78_max_messages to service_role;
comment on table public.ch78_max_messages is
  'Private MAX archive. Backend-only. Contains private message and attachment metadata; no public read API.';
commit;
