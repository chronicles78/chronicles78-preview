-- Source disclosures edit the original answer; no duplicate source messages.
alter table public.ch78_max_callbacks
 add column source_ref text check(source_ref ~ '^S[1-8]$'),
 add column source_effect text check(source_effect in ('show','hide'));
create index ch78_max_callbacks_panel on public.ch78_max_callbacks(parent_id,created_at desc) where source_effect is not null;
create or replace function public.ch78_max_claim_callback(p_callback_id text,p_chat_id text,p_user_id text,
 p_parent_id uuid,p_message_id text,p_action text,p_source_ref text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.ch78_max_jobs; inserted integer; last_panel public.ch78_max_callbacks; effect text;
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
 -- Only one in-flight edit per answer; unknown external outcomes are never replayed.
 if p_action='source' then
  if exists(select 1 from public.ch78_max_callbacks where parent_id=j.id and source_effect is not null and state in ('claimed','unknown')) then return null; end if;
  select * into last_panel from public.ch78_max_callbacks where parent_id=j.id and state='done' and source_effect is not null order by created_at desc,callback_id desc limit 1;
  effect:=case when last_panel.source_effect='show' and last_panel.source_ref=p_source_ref then 'hide' else 'show' end;
 end if;

 if exists(select 1 from public.ch78_max_callbacks where chat_id=p_chat_id and created_at>clock_timestamp()-interval '1 second')
  or exists(select 1 from public.ch78_max_callbacks where chat_id=p_chat_id and user_id=p_user_id and created_at>clock_timestamp()-interval '2 seconds') then return null; end if;
 if (select count(*) from public.ch78_max_callbacks where chat_id=p_chat_id and
  (created_at at time zone 'Europe/Samara')::date=(clock_timestamp() at time zone 'Europe/Samara')::date)>=100 then return null; end if;
 insert into public.ch78_max_callbacks(callback_id,chat_id,user_id,parent_id,action,source_ref,source_effect)
 values(p_callback_id,p_chat_id,p_user_id,p_parent_id,p_action,case when p_action='source' then p_source_ref end,effect) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted<>1 then return null; end if;
 return jsonb_build_object('parent_id',j.id,'message_id',p_message_id,'action',j.action,'result',j.result,'source_effect',effect,'edit_mid',j.sent_message_id);
end $$;
