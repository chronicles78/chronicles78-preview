-- Run only after owner approval, migration and verified worker deployment.
begin;
do $$ begin
 if not exists(select 1 from public.ch78_max_bot_config where id and
  chat_id='-72977812571458' and commands_enabled and generation_enabled and sending_enabled) then
  raise exception 'Expected active test-chat configuration missing';
 end if;
end $$;
update public.ch78_max_bot_config set typing_enabled=true where id and chat_id='-72977812571458';
commit;
select chat_id,typing_enabled,reaction_mode from public.ch78_max_bot_config where id;
