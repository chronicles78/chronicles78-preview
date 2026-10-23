-- Disabled by default. Drafts never enter the send queue.
alter table public.ch78_max_bot_config
 add column reaction_mode text not null default 'off' check(reaction_mode in ('off','draft','auto')),
 add column reaction_daily_limit integer not null default 5 check(reaction_daily_limit between 0 and 10),
 add column reactions_activated_at timestamptz not null default clock_timestamp();
alter table public.ch78_max_jobs drop constraint ch78_max_jobs_action_check;
alter table public.ch78_max_jobs add constraint ch78_max_jobs_action_check check(action in ('answer','search','reaction'));
alter table public.ch78_max_jobs drop constraint ch78_max_jobs_state_check;
alter table public.ch78_max_jobs add constraint ch78_max_jobs_state_check check(state in
 ('queued','generating','ready','sending','sent','failed','generation_unknown','delivery_unknown','review','skipped'));
alter table public.ch78_max_jobs add column review_required boolean not null default false;

create function public.ch78_max_enqueue_reaction() returns trigger
language plpgsql security invoker set search_path='' as $$
declare cfg public.ch78_max_bot_config; t timestamptz:=clock_timestamp();
begin
 select * into cfg from public.ch78_max_bot_config where id;
 if not found or cfg.reaction_mode='off' or not cfg.commands_enabled or new.chat_id<>cfg.chat_id then return new; end if;
 if new.sender->>'is_bot' is distinct from 'false' or coalesce(new.sender->>'user_id','') !~ '^[1-9][0-9]{0,15}$' then return new; end if;
 if new.message_ts<extract(epoch from greatest(cfg.activated_at,cfg.reactions_activated_at))*1000
  or new.message_ts<extract(epoch from t-interval '10 minutes')*1000
  or new.message_ts>extract(epoch from t+interval '30 seconds')*1000 then return new; end if;
 -- Cheap eligibility is not a semantic decision. The model may choose silence.
 if length(btrim(new.text))<80 or public.ch78_max_parse_address(new.text) is not null
  or btrim(new.text) ~ '^/' or new.text !~* '(помн|вспомин|школ|класс|учител|урок|встреч|двор|лагер|дискот|Куйбыш|Самар|Волг)' then return new; end if;
 if new.linked_message->>'type'='forward' then return new; end if;
 if new.linked_message->>'type'='reply' and exists(select 1 from public.ch78_max_jobs
  where chat_id=new.chat_id and sent_message_id=new.linked_message->'message'->>'mid') then return new; end if;
 perform pg_catalog.pg_advisory_xact_lock(78143291213122);
 if exists(select 1 from public.ch78_max_jobs where chat_id=new.chat_id and message_id=new.message_id) then return new; end if;
 if exists(select 1 from public.ch78_max_jobs where chat_id=cfg.chat_id and action='reaction'
  and created_at>t-interval '30 minutes') then return new; end if;
 if (select count(*) from public.ch78_max_jobs where chat_id=cfg.chat_id and action='reaction'
  and (created_at at time zone 'Europe/Samara')::date=(t at time zone 'Europe/Samara')::date)>=cfg.reaction_daily_limit then return new; end if;
 insert into public.ch78_max_jobs(chat_id,message_id,action,question,review_required)
 values(new.chat_id,new.message_id,'reaction',left(btrim(new.text),300),cfg.reaction_mode='draft') on conflict do nothing;
 return new;
end $$;
revoke all on function public.ch78_max_enqueue_reaction() from public,anon,authenticated;
grant execute on function public.ch78_max_enqueue_reaction() to service_role;
create trigger ch78_max_reaction_after_insert after insert on public.ch78_max_messages
 for each row execute function public.ch78_max_enqueue_reaction();

-- Anchor and preceding human conversation only, within this one private group.
create function public.ch78_max_reaction_context(p_message_id text)
 returns table(message_id text,message_ts bigint,author text,content text)
language sql stable security invoker set search_path='' as $$
 select m.message_id,m.message_ts,
 coalesce(nullif(m.sender->>'name',''),nullif(concat_ws(' ',m.sender->>'first_name',m.sender->>'last_name'),''),'Автор не указан'),
 left(m.text,case when m.message_id=a.message_id then 4000 else 500 end)
 from public.ch78_max_messages a join public.ch78_max_bot_config c on c.id and c.chat_id=a.chat_id
 join public.ch78_max_messages m on m.chat_id=a.chat_id
 where a.message_id=p_message_id and (m.message_ts,m.message_id)<=(a.message_ts,a.message_id)
 and m.message_ts>=a.message_ts-21600000 and btrim(m.text)<>''
 and m.sender->>'is_bot'='false' and public.ch78_max_parse_address(m.text) is null
 and not exists(select 1 from public.ch78_max_jobs j where j.chat_id=m.chat_id and j.message_id=m.message_id and j.action<>'reaction')
 order by m.message_ts desc,m.message_id desc limit 5;
$$;
revoke all on function public.ch78_max_reaction_context(text) from public,anon,authenticated;
grant execute on function public.ch78_max_reaction_context(text) to service_role;

create or replace function public.ch78_max_enqueue_command() returns trigger
language plpgsql security invoker set search_path='' as $$
declare cfg public.ch78_max_bot_config; cmd text[]; q text; t timestamptz:=clock_timestamp();
 notice text; parent_q text; kind text; zero_usage jsonb:='{"version":1,"requests":0,"reported_requests":0,"complete":true,"input_tokens":0,"output_tokens":0,"total_tokens":0,"cached_input_tokens":0,"reasoning_tokens":0,"reports":[]}'::jsonb;
begin
 select * into cfg from public.ch78_max_bot_config where id;
 if not found or not cfg.commands_enabled or new.chat_id<>cfg.chat_id then return new; end if;
 if coalesce(new.sender->>'user_id','') !~ '^[1-9][0-9]{0,15}$'
   or new.sender->>'is_bot' is distinct from 'false' then return new; end if;
 if new.message_ts < extract(epoch from cfg.activated_at)*1000
   or new.message_ts < extract(epoch from t-interval '10 minutes')*1000
   or new.message_ts > extract(epoch from t+interval '30 seconds')*1000 then return new; end if;
 cmd:=public.ch78_max_parse_address(new.text);
 -- Only replies to messages actually delivered by this bot in this group count.
 if new.linked_message->>'type'='reply' then
  select case when j.result->>'kind' is null then j.question else null end into parent_q from public.ch78_max_jobs j
   where j.chat_id=new.chat_id and j.state='sent' and j.action<>'reaction'
   and j.sent_message_id=new.linked_message->'message'->>'mid'
   limit 1;
  if found and cmd is null then cmd:=array['answer',btrim(new.text)]; end if;
 end if;
 if cmd is null then return new; end if;
 q:=cmd[2];
 if cmd[1]='help' or length(q) not between 1 and 300 or lower(q) ~ '^(привет|здравствуй|здравствуйте|помощь|что ты умеешь|как пользоваться)[[:space:]!?.]*$' then
  kind:='help'; notice:='Я Хранитель Хроник-78. Помогаю искать воспоминания в архиве нашей группы и отвечать по найденным сообщениям.

Напишите: «Хранитель, какой певческий опыт был у Аллы?»
/ask вопрос — ответ по архиву
/find слова — поиск сообщений
/help — эта подсказка

Можно ответить на моё сообщение с уточняющим вопросом. Если сведений мало, скажу об этом. Вложения пока не читаю. Вопрос — до 300 символов.';
 elsif lower(q) ~ '^(спасибо|благодарю|спасибо большое)[[:space:]!?.]*$' then
  kind:='thanks'; notice:='Пожалуйста! Если нужно найти ещё одно воспоминание, напишите «Хранитель, …».';
 end if;
 if kind is null and parent_q is not null and length(parent_q)+length(q)+24>300 then
  kind:='clarification'; notice:='Чтобы не потерять смысл длинного обсуждения, задайте вопрос целиком: «Хранитель, …» (до 300 символов).';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(78143291213122);
 if kind is not null and exists(select 1 from public.ch78_max_jobs j join public.ch78_max_messages m using(chat_id,message_id)
  where j.chat_id=cfg.chat_id and j.action<>'reaction' and m.sender->>'user_id'=new.sender->>'user_id'
  and j.created_at>t-interval '30 seconds' and j.result->>'kind' is not null) then return new; end if;
 -- Per-person interval: another participant does not block your question.
 if kind is null and exists(select 1 from public.ch78_max_jobs j join public.ch78_max_messages m using(chat_id,message_id)
  where j.chat_id=cfg.chat_id and j.action<>'reaction' and m.sender->>'user_id'=new.sender->>'user_id'
  and j.created_at>t-interval '30 seconds') then
  -- One short feedback per person per interval; suppress floods without paid calls.
  if exists(select 1 from public.ch78_max_jobs j join public.ch78_max_messages m using(chat_id,message_id)
   where j.chat_id=cfg.chat_id and j.action<>'reaction' and m.sender->>'user_id'=new.sender->>'user_id'
   and j.created_at>t-interval '30 seconds' and j.result->>'kind'='cooldown') then return new; end if;
  kind:='cooldown'; notice:='Пожалуйста, подождите 30 секунд перед следующим вопросом. Затем отправьте его снова.';
 end if;
 if kind is null and (select count(*) from public.ch78_max_jobs where chat_id=cfg.chat_id and action<>'reaction'
  and result->>'kind' is null and (created_at at time zone 'Europe/Samara')::date=(t at time zone 'Europe/Samara')::date)>=20 then
  kind:='daily_limit'; notice:='На сегодня достигнут общий лимит группы: 20 запросов к архиву. Новые запросы будут доступны после полуночи по Самаре.';
 end if;
 -- Bounded free service replies, in addition to the existing 20 archive jobs/day.
 if kind is not null and (select count(*) from public.ch78_max_jobs where chat_id=cfg.chat_id and action<>'reaction'
  and result->>'kind' is not null and (created_at at time zone 'Europe/Samara')::date=(t at time zone 'Europe/Samara')::date)>=60 then return new; end if;
 if kind is not null then
  insert into public.ch78_max_jobs(chat_id,message_id,action,question,state,reply_text,result)
   values(new.chat_id,new.message_id,'search',left(coalesce(nullif(q,''),'Помощь'),300),'ready',notice,
    jsonb_build_object('kind',kind,'usage',zero_usage)) on conflict do nothing;
 else
  -- Include the previous question, not an unverified model answer, in a short reply thread.
  if parent_q is not null and length(parent_q)+length(q)+24<=300 then
   q:='Ранее: '||parent_q||E'\nУточнение: '||q;
  end if;
  insert into public.ch78_max_jobs(chat_id,message_id,action,question)
   values(new.chat_id,new.message_id,cmd[1],q) on conflict do nothing;
 end if;
 return new;
end $$;

create or replace function public.ch78_max_claim_job(p_stage text) returns setof public.ch78_max_jobs
language plpgsql security invoker set search_path='' as $$
declare cfg public.ch78_max_bot_config;
begin
 if p_stage not in ('generate','send') or p_stage is null then raise exception 'Invalid stage'; end if;
 select * into cfg from public.ch78_max_bot_config where id;
 if not found then return; end if;
 update public.ch78_max_jobs set state=case state when 'generating' then 'generation_unknown' else 'delivery_unknown' end,
 error_code='lease_expired',lease=null,lease_until=null,updated_at=clock_timestamp()
 where chat_id=cfg.chat_id and state in ('generating','sending') and lease_until<clock_timestamp();
 update public.ch78_max_jobs set state='skipped',error_code='reaction_stale',updated_at=clock_timestamp()
 where chat_id=cfg.chat_id and action='reaction' and state in ('queued','ready') and created_at<clock_timestamp()-interval '30 minutes';
 if (p_stage='generate' and not cfg.generation_enabled) or (p_stage='send' and not cfg.sending_enabled) then return; end if;
 return query with candidate as (
  select id from public.ch78_max_jobs where chat_id=cfg.chat_id
   and state=case p_stage when 'generate' then 'queued' else 'ready' end
   and (action<>'reaction' or (cfg.reaction_mode<>'off' and (p_stage='generate' or (cfg.reaction_mode='auto' and not review_required))))
   order by (action='reaction'),created_at,id for update skip locked limit 1
 ) update public.ch78_max_jobs j set state=case p_stage when 'generate' then 'generating' else 'sending' end,
   review_required=j.review_required or (j.action='reaction' and p_stage='generate' and cfg.reaction_mode='draft'),
   lease=pg_catalog.gen_random_uuid(),lease_until=clock_timestamp()+interval '180 seconds',updated_at=clock_timestamp()
   from candidate c where j.id=c.id returning j.*;
end $$;

create or replace function public.ch78_max_job_gate(p_id uuid,p_lease uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.ch78_max_jobs j join public.ch78_max_bot_config c on c.chat_id=j.chat_id
 where j.id=p_id and j.lease=p_lease and j.lease_until>clock_timestamp()
 and (j.action<>'reaction' or (c.reaction_mode<>'off' and j.created_at>clock_timestamp()-interval '30 minutes'
  and (j.state='generating' or (c.reaction_mode='auto' and not j.review_required))))
 and ((j.state='generating' and c.generation_enabled) or (j.state='sending' and c.sending_enabled)));
$$;

create or replace function public.ch78_max_finish_job(p_id uuid,p_lease uuid,p_state text,
 p_reply text default null,p_result jsonb default null,p_sent_id text default null,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
 if p_state in ('ready','review') and (p_reply is null or p_result is null) then raise exception 'Missing result'; end if;
 if p_state='sent' and p_sent_id is null then raise exception 'Missing sent ID'; end if;
 update public.ch78_max_jobs set state=p_state,reply_text=coalesce(p_reply,reply_text),
 result=coalesce(p_result,result),sent_message_id=p_sent_id,error_code=p_error,
 lease=null,lease_until=null,updated_at=clock_timestamp()
 where id=p_id and lease=p_lease
 and (p_state not in ('review','skipped') or action='reaction')
 and not (p_state='ready' and action='reaction' and review_required) and lease_until>clock_timestamp()
 and ((state='generating' and p_state in ('ready','review','skipped','failed','generation_unknown'))
   or (state='sending' and p_state in ('sent','failed','delivery_unknown')));
 get diagnostics changed=row_count; return changed=1;
end $$;
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
      and public.ch78_max_parse_address(m.text) is null
      and not exists(select 1 from public.ch78_max_jobs j where j.chat_id=m.chat_id and j.message_id=m.message_id and j.action<>'reaction')
      and not (coalesce(m.linked_message->>'type','')='reply' and exists(
        select 1 from public.ch78_max_jobs j where j.chat_id=m.chat_id and j.state='sent' and j.action<>'reaction'
          and j.sent_message_id=m.linked_message->'message'->>'mid')) and
      case when p_mode='literal' then strpos(lower(m.text),lower(q))>0
        else to_tsvector('russian'::regconfig,replace(lower(m.text),'ё','е')) @@ terms end
    order by 5 desc,m.message_ts desc,m.message_id desc
    limit p_limit;
end;
$$;
