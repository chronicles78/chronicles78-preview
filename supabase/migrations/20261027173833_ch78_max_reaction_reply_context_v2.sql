-- Draft release SQL. The original context function remains compatible.
-- Apply only with the matching worker; never expose to public clients.

create or replace function public.ch78_max_reaction_context_v2(p_message_id text)
returns table(message_id text,message_ts bigint,author text,content text,
 reply_to text,reply_to_author text,reply_to_is_bot boolean,reply_to_user_id text)
language sql stable security invoker set search_path='' as $$
 with bounded as (
  select c.*,m.chat_id,
   case when m.linked_message->>'type'='reply'
    and jsonb_typeof(m.linked_message#>'{message,mid}')='string'
    and length(m.linked_message#>>'{message,mid}') between 1 and 512
    and m.linked_message#>>'{message,mid}'<>m.message_id
    and (m.linked_message->>'chat_id' is null or m.linked_message->>'chat_id'=m.chat_id)
   then m.linked_message#>>'{message,mid}' else null end as target_id
  from public.ch78_max_reaction_context(p_message_id) c
  join public.ch78_max_bot_config cfg on cfg.id
  join public.ch78_max_messages m on m.chat_id=cfg.chat_id and m.message_id=c.message_id
 )
 select b.message_id,b.message_ts,b.author,b.content,b.target_id as reply_to,
  case when target.message_id is not null then left(coalesce(nullif(target.sender->>'name',''),
   nullif(concat_ws(' ',target.sender->>'first_name',target.sender->>'last_name'),''),'Автор не указан'),300) end as reply_to_author,
  case when target.sender->>'is_bot'='true' then true
       when target.sender->>'is_bot'='false' then false else null end as reply_to_is_bot,
  case when target.sender->>'user_id' ~ '^[1-9][0-9]{0,15}$' then target.sender->>'user_id' end as reply_to_user_id
 from bounded b
 left join public.ch78_max_messages target on target.chat_id=b.chat_id and target.message_id=b.target_id
  and (target.message_ts,target.message_id)<(b.message_ts,b.message_id)
 order by b.message_ts desc,b.message_id desc;
$$;
revoke all on function public.ch78_max_reaction_context_v2(text) from public,anon,authenticated;
grant execute on function public.ch78_max_reaction_context_v2(text) to service_role;

notify pgrst, 'reload schema';
