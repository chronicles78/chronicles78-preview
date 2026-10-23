-- Commands are disabled until explicit activation. No historical backfill.
create table public.ch78_max_bot_config (
  id boolean primary key default true check (id),
  chat_id text not null check (chat_id = '-78143291213122'),
  owner_id text not null check (owner_id = '17770818'),
  commands_enabled boolean not null default false,
  generation_enabled boolean not null default false,
  sending_enabled boolean not null default false,
  activated_at timestamptz not null default clock_timestamp()
);
insert into public.ch78_max_bot_config(id,chat_id,owner_id)
values (true,'-78143291213122','17770818');
create table public.ch78_max_jobs (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  message_id text not null,
  action text not null check (action in ('search','answer')),
  question text not null check (length(question) between 1 and 300),
  state text not null default 'queued' check (state in
    ('queued','generating','ready','sending','sent','failed','generation_unknown','delivery_unknown')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  lease uuid,
  lease_until timestamptz,
  reply_text text check (length(reply_text) between 1 and 4000),
  result jsonb check (jsonb_typeof(result)='object' and octet_length(result::text)<=131072),
  sent_message_id text check (length(sent_message_id) between 1 and 512),
  error_code text check (error_code ~ '^[a-z_]{1,80}$'),
  unique (chat_id,message_id,action),
  foreign key (chat_id,message_id) references public.ch78_max_messages(chat_id,message_id)
);
create index ch78_max_jobs_pending on public.ch78_max_jobs(state,created_at);
create index ch78_max_jobs_rate on public.ch78_max_jobs(chat_id,created_at);
alter table public.ch78_max_jobs enable row level security;
alter table public.ch78_max_jobs force row level security;
alter table public.ch78_max_bot_config enable row level security;
alter table public.ch78_max_bot_config force row level security;
revoke all on public.ch78_max_jobs,public.ch78_max_bot_config from public,anon,authenticated,service_role;
grant select on public.ch78_max_bot_config to service_role;
grant select,insert,update on public.ch78_max_jobs to service_role;

create function public.ch78_max_enqueue_command() returns trigger
language plpgsql security invoker set search_path='' as $$
declare cfg public.ch78_max_bot_config; cmd text[]; q text; t timestamptz:=clock_timestamp();
begin
  select * into cfg from public.ch78_max_bot_config where id;
  if not found or not cfg.commands_enabled or new.chat_id<>cfg.chat_id then return new; end if;
  if new.sender->>'user_id' is distinct from cfg.owner_id
    or new.sender->>'is_bot' is distinct from 'false' then return new; end if;
  if new.message_ts < extract(epoch from cfg.activated_at)*1000
    or new.message_ts < extract(epoch from t-interval '10 minutes')*1000
    or new.message_ts > extract(epoch from t+interval '30 seconds')*1000 then return new; end if;
  cmd:=regexp_match(new.text,'^/(ask|find)[[:space:]]+(.+)$','is');
  if cmd is null then return new; end if;
  q:=btrim(cmd[2]); if length(q) not between 1 and 300 then return new; end if;
  -- Serialize admission/rate checks for this group, including concurrent webhook calls.
  perform pg_catalog.pg_advisory_xact_lock(78143291213122);
  if exists(select 1 from public.ch78_max_jobs where chat_id=cfg.chat_id
    and created_at>t-interval '30 seconds') then return new; end if;
  if (select count(*) from public.ch78_max_jobs where chat_id=cfg.chat_id
    and (created_at at time zone 'Europe/Samara')::date=(t at time zone 'Europe/Samara')::date)>=20 then return new; end if;
  insert into public.ch78_max_jobs(chat_id,message_id,action,question)
    values(new.chat_id,new.message_id,case lower(cmd[1]) when 'ask' then 'answer' else 'search' end,q)
    on conflict(chat_id,message_id,action) do nothing;
  return new;
end $$;
revoke all on function public.ch78_max_enqueue_command() from public,anon,authenticated;
grant execute on function public.ch78_max_enqueue_command() to service_role;
create trigger ch78_max_command_after_insert after insert on public.ch78_max_messages
for each row execute function public.ch78_max_enqueue_command();

create function public.ch78_max_claim_job(p_stage text) returns setof public.ch78_max_jobs
language plpgsql security invoker set search_path='' as $$
declare cfg public.ch78_max_bot_config;
begin
 if p_stage not in ('generate','send') or p_stage is null then raise exception 'Invalid stage'; end if;
 select * into cfg from public.ch78_max_bot_config where id;
 if not found then return; end if;
 update public.ch78_max_jobs set state=case state when 'generating' then 'generation_unknown' else 'delivery_unknown' end,
 error_code='lease_expired',lease=null,lease_until=null,updated_at=clock_timestamp()
 where chat_id=cfg.chat_id and state in ('generating','sending') and lease_until<clock_timestamp();
 if (p_stage='generate' and not cfg.generation_enabled) or (p_stage='send' and not cfg.sending_enabled) then return; end if;
 return query with candidate as (
  select id from public.ch78_max_jobs where chat_id=cfg.chat_id
   and state=case p_stage when 'generate' then 'queued' else 'ready' end
   order by created_at,id for update skip locked limit 1
 ) update public.ch78_max_jobs j set state=case p_stage when 'generate' then 'generating' else 'sending' end,
   lease=pg_catalog.gen_random_uuid(),lease_until=clock_timestamp()+interval '180 seconds',updated_at=clock_timestamp()
   from candidate c where j.id=c.id returning j.*;
end $$;

create function public.ch78_max_job_gate(p_id uuid,p_lease uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.ch78_max_jobs j join public.ch78_max_bot_config c on c.chat_id=j.chat_id
 where j.id=p_id and j.lease=p_lease and j.lease_until>clock_timestamp()
 and ((j.state='generating' and c.generation_enabled) or (j.state='sending' and c.sending_enabled)));
$$;

create function public.ch78_max_finish_job(p_id uuid,p_lease uuid,p_state text,
 p_reply text default null,p_result jsonb default null,p_sent_id text default null,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
 if p_state='ready' and (p_reply is null or p_result is null) then raise exception 'Missing result'; end if;
 if p_state='sent' and p_sent_id is null then raise exception 'Missing sent ID'; end if;
 update public.ch78_max_jobs set state=p_state,reply_text=coalesce(p_reply,reply_text),
 result=coalesce(p_result,result),sent_message_id=p_sent_id,error_code=p_error,
 lease=null,lease_until=null,updated_at=clock_timestamp()
 where id=p_id and lease=p_lease and lease_until>clock_timestamp()
 and ((state='generating' and p_state in ('ready','failed','generation_unknown'))
   or (state='sending' and p_state in ('sent','failed','delivery_unknown')));
 get diagnostics changed=row_count; return changed=1;
end $$;
revoke all on function public.ch78_max_claim_job(text),public.ch78_max_job_gate(uuid,uuid),
 public.ch78_max_finish_job(uuid,uuid,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.ch78_max_claim_job(text),public.ch78_max_job_gate(uuid,uuid),
 public.ch78_max_finish_job(uuid,uuid,text,text,jsonb,text,text) to service_role;

-- Preserve raw archive, but do not use commands or bot replies as evidence.
create or replace function public.ch78_max_search(
  p_chat_id text, p_query text, p_mode text default 'forms', p_limit integer default 8
) returns table(message_id text, message_ts bigint, author text, content text, score real)
language plpgsql stable security invoker set search_path = ''
as $$
declare
  q text; terms tsquery;
begin
  if p_query is null or length(btrim(p_query)) not between 1 and 300
     or p_chat_id is null or p_chat_id !~ '^-?[1-9][0-9]{0,15}$'
     or p_mode is null or p_mode not in ('forms','literal')
     or p_limit is null or p_limit not between 1 and 10 then
    raise exception 'Invalid search parameters' using errcode='22023';
  end if;
  q := btrim(p_query);
  if p_mode = 'forms' then
    terms := websearch_to_tsquery('russian'::regconfig,replace(lower(q),'ё','е'));
    if numnode(terms)=0 then return; end if;
  end if;
  return query
    select m.message_id, m.message_ts,
      coalesce(nullif(m.sender->>'name',''),nullif(concat_ws(' ',m.sender->>'first_name',m.sender->>'last_name'),''),'Автор не указан'),
      m.text,
      case when p_mode='literal' then 1::real else
        ts_rank_cd(to_tsvector('russian'::regconfig,replace(lower(m.text),'ё','е')),terms,32) end
    from public.ch78_max_messages m
    where m.chat_id=p_chat_id and btrim(m.text)<>''
      and coalesce(m.sender->>'is_bot','false')<>'true'
      and m.text !~* '^/(ask|find)[[:space:]]' and
      case when p_mode='literal' then strpos(lower(m.text),lower(q))>0
        else to_tsvector('russian'::regconfig,replace(lower(m.text),'ё','е')) @@ terms end
    order by 5 desc,m.message_ts desc,m.message_id desc
    limit p_limit;
end;
$$;
