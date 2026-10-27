-- Additional server-only candidates by publication month. Not an event-date claim.
create function public.ch78_max_search_month(p_chat_id text,p_query text,p_month integer,p_year integer default null,p_limit integer default 8)
returns table(message_id text,message_ts bigint,author text,content text,score real)
language plpgsql stable security invoker set search_path='' as $$
declare terms tsquery;
begin
 if p_chat_id is null or p_chat_id !~ '^-?[1-9][0-9]{0,15}$' or p_query is null or length(btrim(p_query)) not between 1 and 300
 or p_month is null or p_month not between 1 and 12 or (p_year is not null and p_year not between 1800 and 2200)
 or p_limit is null or p_limit not between 1 and 8 then raise exception 'Invalid search parameters' using errcode='22023'; end if;
 terms:=websearch_to_tsquery('russian'::regconfig,replace(lower(btrim(p_query)),'ё','е'));
 if numnode(terms)=0 then return; end if;
 return query select m.message_id,m.message_ts,
 coalesce(nullif(m.sender->>'name',''),nullif(concat_ws(' ',m.sender->>'first_name',m.sender->>'last_name'),''),'Автор не указан'),m.text,
 ts_rank_cd(to_tsvector('russian'::regconfig,replace(lower(m.text),'ё','е')),terms,32)
 from public.ch78_max_messages m
 where m.chat_id=p_chat_id and btrim(m.text)<>'' and coalesce(m.sender->>'is_bot','false')<>'true'
 and extract(month from to_timestamp(m.message_ts/1000.0) at time zone 'Europe/Samara')=p_month
 and (p_year is null or extract(year from to_timestamp(m.message_ts/1000.0) at time zone 'Europe/Samara')=p_year)
 and public.ch78_max_parse_address(m.text) is null
 and not exists(select 1 from public.ch78_max_jobs j where j.chat_id=m.chat_id and j.message_id=m.message_id and j.action<>'reaction')
 and not (coalesce(m.linked_message->>'type','')='reply' and exists(select 1 from public.ch78_max_jobs j
 where j.chat_id=m.chat_id and j.state='sent' and j.action<>'reaction' and j.sent_message_id=m.linked_message->'message'->>'mid'))
 and to_tsvector('russian'::regconfig,replace(lower(m.text),'ё','е')) @@ terms
 order by 5 desc,m.message_ts desc,m.message_id desc limit p_limit;
end $$;
revoke all on function public.ch78_max_search_month(text,text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.ch78_max_search_month(text,text,integer,integer,integer) to service_role;
