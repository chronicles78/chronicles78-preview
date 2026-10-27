-- Private structural retrieval. Identity, chronology and explicit reply links
-- come from saved metadata, never from model guesses or text mentions.
create index ch78_max_messages_author_time on public.ch78_max_messages(chat_id,(sender->>'user_id'),message_ts desc,message_id desc);
create function public.ch78_max_resolve_author(p_chat_id text,p_question text)
returns table(user_id text,author text,last_ts bigint,matches integer)
language plpgsql stable security invoker set search_path='' as $$
begin
 if p_chat_id is null or p_question is null or length(btrim(p_question)) not between 1 and 300 then raise exception 'Invalid parameters' using errcode='22023'; end if;
 return query with latest as (
  select distinct on (m.sender->>'user_id') m.sender->>'user_id' uid,
   coalesce(nullif(m.sender->>'name',''),nullif(concat_ws(' ',m.sender->>'first_name',m.sender->>'last_name'),''),'Автор не указан') label,
   m.message_ts ts from public.ch78_max_messages m
  where m.chat_id=p_chat_id and m.sender->>'user_id' ~ '^[1-9][0-9]{0,15}$' and coalesce(m.sender->>'is_bot','false')<>'true'
  order by m.sender->>'user_id',m.message_ts desc,m.message_id desc
 ), tokens as (
  select distinct token from regexp_split_to_table(replace(lower(p_question),'ё','е'),'[^[:alnum:]]+') token where length(token) between 2 and 80
 ), scored as (
  -- The Russian stemmer does not equate Павел and Павла. Add the dropped-
  -- vowel form for matching only; never change the stored/displayed identity.
  select l.*, (select count(*)::integer from tokens t where to_tsvector('russian'::regconfig,replace(lower(l.label),'ё','е')||' '||regexp_replace(replace(lower(l.label),'ё','е'),'\mпавел\M','павл','g')) @@ plainto_tsquery('russian'::regconfig,t.token)) n from latest l
 ) select uid,label,ts,n from scored where n>0 and n=(select max(n) from scored) order by label,uid limit 10;
end $$;

create function public.ch78_max_author_messages(p_chat_id text,p_user_id text,p_month integer default null,p_year integer default null,p_day integer default null,p_limit integer default 8)
returns table(message_id text,message_ts bigint,author text,content text,score real)
language plpgsql stable security invoker set search_path='' as $$
begin
 if p_chat_id is null or p_user_id is null or p_user_id !~ '^[1-9][0-9]{0,15}$' or p_limit is null or p_limit not between 1 and 8
 or (p_month is not null and p_month not between 1 and 12) or (p_year is not null and p_year not between 1800 and 2200)
 or (p_day is not null and (p_month is null or p_day not between 1 and 31)) then raise exception 'Invalid parameters' using errcode='22023'; end if;
 return query select m.message_id,m.message_ts,
 coalesce(nullif(m.sender->>'name',''),nullif(concat_ws(' ',m.sender->>'first_name',m.sender->>'last_name'),''),'Автор не указан'),m.text,1::real
 from public.ch78_max_messages m where m.chat_id=p_chat_id and m.sender->>'user_id'=p_user_id
 and coalesce(m.sender->>'is_bot','false')<>'true' and btrim(m.text)<>'' and public.ch78_max_parse_address(m.text) is null
 and (p_month is null or extract(month from to_timestamp(m.message_ts/1000.0) at time zone 'Europe/Samara')=p_month)
 and (p_year is null or extract(year from to_timestamp(m.message_ts/1000.0) at time zone 'Europe/Samara')=p_year)
 and (p_day is null or extract(day from to_timestamp(m.message_ts/1000.0) at time zone 'Europe/Samara')=p_day)
 order by m.message_ts desc,m.message_id desc limit p_limit;
end $$;

create function public.ch78_max_thread_context(p_chat_id text,p_message_ids text[],p_limit integer default 2)
returns table(message_id text,message_ts bigint,author text,content text,score real)
language plpgsql stable security invoker set search_path='' as $$
begin
 if p_chat_id is null or p_message_ids is null or cardinality(p_message_ids) not between 1 and 8 or p_limit is null or p_limit not between 1 and 2
 or exists(select 1 from unnest(p_message_ids) id where id is null or length(id) not between 1 and 512) then raise exception 'Invalid parameters' using errcode='22023'; end if;
 return query with seeds as (select m.* from public.ch78_max_messages m where m.chat_id=p_chat_id and m.message_id=any(p_message_ids))
 select m.message_id,m.message_ts,
 coalesce(nullif(m.sender->>'name',''),nullif(concat_ws(' ',m.sender->>'first_name',m.sender->>'last_name'),''),'Автор не указан'),m.text,1::real
 from public.ch78_max_messages m where m.chat_id=p_chat_id and not(m.message_id=any(p_message_ids))
 and btrim(m.text)<>'' and coalesce(m.sender->>'is_bot','false')<>'true' and public.ch78_max_parse_address(m.text) is null
 and not exists(select 1 from public.ch78_max_jobs j where j.chat_id=m.chat_id and j.message_id=m.message_id and j.action<>'reaction')
 and exists(select 1 from seeds s where (s.linked_message->>'type'='reply' and s.linked_message->'message'->>'mid'=m.message_id)
 or (m.linked_message->>'type'='reply' and m.linked_message->'message'->>'mid'=s.message_id))
 order by m.message_ts desc,m.message_id desc limit p_limit;
end $$;
revoke all on function public.ch78_max_resolve_author(text,text),public.ch78_max_author_messages(text,text,integer,integer,integer,integer),public.ch78_max_thread_context(text,text[],integer) from public,anon,authenticated;
grant execute on function public.ch78_max_resolve_author(text,text),public.ch78_max_author_messages(text,text,integer,integer,integer,integer),public.ch78_max_thread_context(text,text[],integer) to service_role;
