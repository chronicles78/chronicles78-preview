-- Reference snapshot for tests; do not execute as a migration.
CREATE OR REPLACE FUNCTION public.ch78_max_reaction_context(p_message_id text)
 RETURNS TABLE(message_id text, message_ts bigint, author text, content text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$
