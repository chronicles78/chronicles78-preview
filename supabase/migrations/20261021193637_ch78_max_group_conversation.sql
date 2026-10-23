-- All real participants of the configured group may explicitly address the bot.
-- Pure parser is shared with evidence filtering; no public execution privileges.
create function public.ch78_max_parse_address(p_text text) returns text[]
language plpgsql immutable security invoker set search_path='' as $$
declare c text[]; q text;
begin
 c:=regexp_match(btrim(p_text),'^/(ask|find|help|start)(@id631934518295_1_bot)?([[:space:]]+(.*))?$','is');
 if c is not null then
  return array[case lower(c[1]) when 'ask' then 'answer' when 'find' then 'search' else 'help' end,coalesce(btrim(c[4]),'')];
 end if;
 c:=regexp_match(btrim(p_text),'^Хранитель([[:space:]]+Хроник[-–—]78)?([[:space:]]*[,!:—-][[:space:]]*|[[:space:]]+)(.*)$','is');
 if c is not null then return array['answer',btrim(c[3])]; end if;
 if btrim(p_text) ~* '^Хранитель([[:space:]]+Хроник[-–—]78)?[[:space:]!?.]*$' then return array['help','']; end if;
 return null;
end $$;
revoke all on function public.ch78_max_parse_address(text) from public,anon,authenticated;
grant execute on function public.ch78_max_parse_address(text) to service_role;

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
   where j.chat_id=new.chat_id and j.state='sent'
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
  where j.chat_id=cfg.chat_id and m.sender->>'user_id'=new.sender->>'user_id'
  and j.created_at>t-interval '30 seconds' and j.result->>'kind' is not null) then return new; end if;
 -- Per-person interval: another participant does not block your question.
 if kind is null and exists(select 1 from public.ch78_max_jobs j join public.ch78_max_messages m using(chat_id,message_id)
  where j.chat_id=cfg.chat_id and m.sender->>'user_id'=new.sender->>'user_id'
  and j.created_at>t-interval '30 seconds') then
  -- One short feedback per person per interval; suppress floods without paid calls.
  if exists(select 1 from public.ch78_max_jobs j join public.ch78_max_messages m using(chat_id,message_id)
   where j.chat_id=cfg.chat_id and m.sender->>'user_id'=new.sender->>'user_id'
   and j.created_at>t-interval '30 seconds' and j.result->>'kind'='cooldown') then return new; end if;
  kind:='cooldown'; notice:='Пожалуйста, подождите 30 секунд перед следующим вопросом. Затем отправьте его снова.';
 end if;
 if kind is null and (select count(*) from public.ch78_max_jobs where chat_id=cfg.chat_id
  and result->>'kind' is null and (created_at at time zone 'Europe/Samara')::date=(t at time zone 'Europe/Samara')::date)>=20 then
  kind:='daily_limit'; notice:='На сегодня достигнут общий лимит группы: 20 запросов к архиву. Новые запросы будут доступны после полуночи по Самаре.';
 end if;
 -- Bounded free service replies, in addition to the existing 20 archive jobs/day.
 if kind is not null and (select count(*) from public.ch78_max_jobs where chat_id=cfg.chat_id
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
      and not exists(select 1 from public.ch78_max_jobs j where j.chat_id=m.chat_id and j.message_id=m.message_id)
      and not (coalesce(m.linked_message->>'type','')='reply' and exists(
        select 1 from public.ch78_max_jobs j where j.chat_id=m.chat_id and j.state='sent'
          and j.sent_message_id=m.linked_message->'message'->>'mid')) and
      case when p_mode='literal' then strpos(lower(m.text),lower(q))>0
        else to_tsvector('russian'::regconfig,replace(lower(m.text),'ё','е')) @@ terms end
    order by 5 desc,m.message_ts desc,m.message_id desc
    limit p_limit;
end;
$$;
