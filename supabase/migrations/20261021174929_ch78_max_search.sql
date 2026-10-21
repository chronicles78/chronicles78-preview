-- CH78-MAX-002: bounded server-only lexical retrieval. No public archive access.
begin;
create index ch78_max_messages_russian_fts on public.ch78_max_messages
  using gin(to_tsvector('russian'::regconfig, replace(lower(text),'ё','е')));
create function public.ch78_max_search(
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
    where m.chat_id=p_chat_id and btrim(m.text)<>'' and
      case when p_mode='literal' then strpos(lower(m.text),lower(q))>0
        else to_tsvector('russian'::regconfig,replace(lower(m.text),'ё','е')) @@ terms end
    order by 5 desc,m.message_ts desc,m.message_id desc
    limit p_limit;
end;
$$;
revoke all on function public.ch78_max_search(text,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.ch78_max_search(text,text,text,integer) to service_role;
comment on function public.ch78_max_search(text,text,text,integer) is
  'Backend-only Russian lexical search. Not embeddings or semantic relevance probability. Does not expose raw message or attachment URLs.';
commit;
