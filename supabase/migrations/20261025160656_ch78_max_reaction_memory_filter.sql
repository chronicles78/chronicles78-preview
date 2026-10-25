-- Recognize воспоминание and its inflections; retain all admission and budget gates.
create or replace function public.ch78_max_enqueue_reaction() returns trigger
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
  or btrim(new.text) ~ '^/' or new.text !~* '(помн|вспомин|воспомин|школ|класс|учител|урок|встреч|двор|лагер|дискот|Куйбыш|Самар|Волг)' then return new; end if;
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
