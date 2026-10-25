-- Disabled until the webhook, worker and callback subscription are configured.
alter table public.ch78_max_bot_config add column buttons_enabled boolean not null default false;
create table public.ch78_max_callbacks (
 callback_id text primary key check(length(callback_id) between 1 and 512),
 chat_id text not null check(chat_id='-78143291213122'),
 user_id text not null check(user_id ~ '^[1-9][0-9]{0,15}$'),
 parent_id uuid not null references public.ch78_max_jobs(id),
 action text not null check(action in ('help','examples','source')),
 created_at timestamptz not null default clock_timestamp(),
 state text not null default 'claimed' check(state in ('claimed','done','failed','unknown')),
 sent_message_id text check(length(sent_message_id) between 1 and 512)
);
create index ch78_max_callbacks_rate on public.ch78_max_callbacks(chat_id,created_at);
alter table public.ch78_max_callbacks enable row level security;
alter table public.ch78_max_callbacks force row level security;
revoke all on public.ch78_max_callbacks from public,anon,authenticated,service_role;
grant select,insert,update on public.ch78_max_callbacks to service_role;

create function public.ch78_max_buttons_enabled() returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce((select buttons_enabled and commands_enabled and sending_enabled from public.ch78_max_bot_config where id),false);
$$;
create function public.ch78_max_claim_callback(p_callback_id text,p_chat_id text,p_user_id text,
 p_parent_id uuid,p_message_id text,p_action text,p_source_ref text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.ch78_max_jobs; inserted integer;
begin
 if not public.ch78_max_buttons_enabled() or p_chat_id is distinct from '-78143291213122'
  or p_user_id is null or p_user_id !~ '^[1-9][0-9]{0,15}$'
  or p_callback_id is null or length(p_callback_id) not between 1 and 512
  or p_action is null or p_action not in ('help','examples','source') then return null; end if;
 select * into j from public.ch78_max_jobs where id=p_parent_id and chat_id=p_chat_id and state='sent';
 if not found or not coalesce((j.sent_message_id=p_message_id or exists(select 1 from public.ch78_max_callbacks
  where parent_id=j.id and chat_id=p_chat_id and state='done' and sent_message_id=p_message_id)),false) then return null; end if;
 if p_action='source' and (p_source_ref is null or not exists(select 1 from jsonb_array_elements(coalesce(j.result->'sources','[]')) s
  where s->>'ref'=p_source_ref and (j.action='search' or (j.result->>'found'='true' and coalesce(j.result->'citations','[]') ? p_source_ref)))) then return null; end if;
 perform pg_catalog.pg_advisory_xact_lock(78143291213122);
 if exists(select 1 from public.ch78_max_callbacks where callback_id=p_callback_id) then return null; end if;
 if exists(select 1 from public.ch78_max_callbacks where chat_id=p_chat_id and created_at>clock_timestamp()-interval '1 second')
  or exists(select 1 from public.ch78_max_callbacks where chat_id=p_chat_id and user_id=p_user_id and created_at>clock_timestamp()-interval '2 seconds') then return null; end if;
 if (select count(*) from public.ch78_max_callbacks where chat_id=p_chat_id and
  (created_at at time zone 'Europe/Samara')::date=(clock_timestamp() at time zone 'Europe/Samara')::date)>=100 then return null; end if;
 insert into public.ch78_max_callbacks(callback_id,chat_id,user_id,parent_id,action)
 values(p_callback_id,p_chat_id,p_user_id,p_parent_id,p_action) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted<>1 then return null; end if;
 return jsonb_build_object('parent_id',j.id,'message_id',p_message_id,'action',j.action,'result',j.result);
end $$;
create function public.ch78_max_finish_callback(p_callback_id text,p_state text,p_sent_id text default null)
 returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if p_state is null or p_state not in ('done','failed','unknown') or (p_state='done' and p_sent_id is null) then return false; end if;
 update public.ch78_max_callbacks set state=p_state,sent_message_id=p_sent_id where callback_id=p_callback_id and state='claimed';
 get diagnostics n=row_count;return n=1;
end $$;
revoke all on function public.ch78_max_buttons_enabled(),public.ch78_max_claim_callback(text,text,text,uuid,text,text,text),
 public.ch78_max_finish_callback(text,text,text) from public,anon,authenticated;
grant execute on function public.ch78_max_buttons_enabled(),public.ch78_max_claim_callback(text,text,text,uuid,text,text,text),
 public.ch78_max_finish_callback(text,text,text) to service_role;
