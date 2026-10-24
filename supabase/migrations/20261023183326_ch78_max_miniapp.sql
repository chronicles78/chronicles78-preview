-- Private mini-app access; both read and paid-answer capabilities start disabled.
alter table public.ch78_max_bot_config
 add column miniapp_enabled boolean not null default false,
 add column miniapp_ai_enabled boolean not null default false,
 add column miniapp_ai_daily_limit integer not null default 5 check(miniapp_ai_daily_limit between 0 and 20);
create table public.ch78_max_miniapp_requests (
 id uuid primary key,
 chat_id text not null check(chat_id='-78143291213122'),
 user_id text not null check(user_id ~ '^[1-9][0-9]{0,15}$'),
 action text not null check(action in ('search','answer')),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 lease uuid not null default gen_random_uuid(),
 state text not null default 'processing' check(state in ('processing','done','failed','unknown')),
 result jsonb check(jsonb_typeof(result)='object' and octet_length(result::text)<=131072)
);
create index ch78_max_miniapp_requests_time on public.ch78_max_miniapp_requests(chat_id,created_at);
create index ch78_max_miniapp_requests_user_time on public.ch78_max_miniapp_requests(user_id,created_at);
alter table public.ch78_max_miniapp_requests enable row level security;
alter table public.ch78_max_miniapp_requests force row level security;
revoke all on public.ch78_max_miniapp_requests from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.ch78_max_miniapp_requests to service_role;
create function public.ch78_max_miniapp_status() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('enabled',c.miniapp_enabled,'ai_enabled',c.miniapp_ai_enabled and c.generation_enabled,
 'ai_daily_limit',c.miniapp_ai_daily_limit,'messages',(select count(*) from public.ch78_max_messages where chat_id=c.chat_id),
 'test_archive',true) from public.ch78_max_bot_config c where c.id and c.chat_id='-78143291213122';
$$;
create function public.ch78_max_miniapp_claim(p_id uuid,p_user_id text,p_action text,p_fingerprint text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.ch78_max_bot_config; r public.ch78_max_miniapp_requests; t timestamptz:=clock_timestamp(); n integer;
begin
 if p_id is null or p_user_id is null or p_user_id !~ '^[1-9][0-9]{0,15}$'
 or p_action is null or p_action not in ('search','answer') or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then
  return jsonb_build_object('kind','invalid'); end if;
 perform pg_catalog.pg_advisory_xact_lock(78143291213123);
 select * into c from public.ch78_max_bot_config where id;
 if not found or not c.miniapp_enabled then return jsonb_build_object('kind','disabled'); end if;
 -- Never retry a paid attempt after an uncertain result. Retain at most seven days on use.
 delete from public.ch78_max_miniapp_requests where created_at<t-interval '7 days';
 select * into r from public.ch78_max_miniapp_requests where id=p_id;
 if found then
  if r.user_id<>p_user_id or r.action<>p_action or r.fingerprint<>p_fingerprint then return jsonb_build_object('kind','conflict'); end if;
  if r.state='processing' and r.created_at<t-interval '120 seconds' then
   update public.ch78_max_miniapp_requests set state='unknown' where id=r.id; r.state:='unknown';
  end if;
  return jsonb_build_object('kind',r.state,'result',case when r.state in ('done','failed') then r.result else null end);
 end if;
 if p_action='answer' and (not c.miniapp_ai_enabled or not c.generation_enabled) then return jsonb_build_object('kind','ai_disabled'); end if;
 if exists(select 1 from public.ch78_max_miniapp_requests where user_id=p_user_id and created_at>t-interval '2 seconds')
 or (p_action='answer' and exists(select 1 from public.ch78_max_miniapp_requests where action='answer' and user_id=p_user_id and created_at>t-interval '30 seconds')) then
  return jsonb_build_object('kind','rate_limit'); end if;
 select count(*) into n from public.ch78_max_miniapp_requests where action=p_action
 and (created_at at time zone 'Europe/Samara')::date=(t at time zone 'Europe/Samara')::date;
 if n>=(case when p_action='answer' then c.miniapp_ai_daily_limit else 200 end) then return jsonb_build_object('kind','daily_limit'); end if;
 insert into public.ch78_max_miniapp_requests(id,chat_id,user_id,action,fingerprint)
 values(p_id,c.chat_id,p_user_id,p_action,p_fingerprint) returning * into r;
 return jsonb_build_object('kind','claimed','lease',r.lease);
end $$;
create function public.ch78_max_miniapp_finish(p_id uuid,p_lease uuid,p_result jsonb,p_ok boolean) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if p_ok is null or p_result is null or jsonb_typeof(p_result)<>'object' then return false; end if;
 update public.ch78_max_miniapp_requests set state=case when p_ok then 'done' else 'failed' end,result=p_result
 where id=p_id and lease=p_lease and state='processing' and created_at>clock_timestamp()-interval '120 seconds';
 get diagnostics n=row_count;return n=1;
end $$;
revoke all on function public.ch78_max_miniapp_status(),public.ch78_max_miniapp_claim(uuid,text,text,text),
 public.ch78_max_miniapp_finish(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.ch78_max_miniapp_status(),public.ch78_max_miniapp_claim(uuid,text,text,text),
 public.ch78_max_miniapp_finish(uuid,uuid,jsonb,boolean) to service_role;
