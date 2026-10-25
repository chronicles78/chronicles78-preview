-- Only after UI/budget approval, hosting verification, function deployment and MAX registration.
-- Separate mini-app budget: five AI questions per Samara day for the entire test group.
begin;
do $$ begin
 if not exists(select 1 from public.ch78_max_bot_config where id and chat_id='-78143291213122'
 and generation_enabled and reaction_mode='draft') then raise exception 'Expected test-chat configuration missing';end if;
end $$;
update public.ch78_max_bot_config set miniapp_enabled=true,miniapp_ai_enabled=true,miniapp_ai_daily_limit=5
 where id and chat_id='-78143291213122';
commit;
select chat_id,miniapp_enabled,miniapp_ai_enabled,miniapp_ai_daily_limit,reaction_mode from public.ch78_max_bot_config where id;
-- Disable all mini-app access: update public.ch78_max_bot_config set miniapp_enabled=false where id;
-- Disable new paid questions only: update public.ch78_max_bot_config set miniapp_ai_enabled=false where id;
