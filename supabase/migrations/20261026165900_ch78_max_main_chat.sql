-- Preserve test records; switch the single active archive with effects paused.
do $move$
declare t text; f record; d text;
begin
 foreach t in array array['ch78_max_bot_config','ch78_max_callbacks','ch78_max_miniapp_requests'] loop
  if to_regclass('public.'||t) is not null then
   execute format('alter table public.%I drop constraint %I',t,t||'_chat_id_check');
   execute format('alter table public.%I add constraint %I check(chat_id in (%L,%L))',t,t||'_chat_id_check','-78143291213122','-72977812571458');
  end if;
 end loop;
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'ch78_max_%' loop
  d:=replace(pg_get_functiondef(f.oid),quote_literal('-78143291213122'),quote_literal('-72977812571458'));
  if f.proname='ch78_max_miniapp_status' then d:=replace(d,'''test_archive'',true','''test_archive'',false'); end if;
  if f.proname='ch78_max_miniapp_claim' then
   d:=replace(d,'if r.user_id<>p_user_id','if r.chat_id<>c.chat_id or r.user_id<>p_user_id');
   d:=replace(d,'where user_id=p_user_id','where chat_id=c.chat_id and user_id=p_user_id');
   d:=replace(d,'where action=''answer'' and user_id=p_user_id','where chat_id=c.chat_id and action=''answer'' and user_id=p_user_id');
   d:=replace(d,'where action=p_action','where chat_id=c.chat_id and action=p_action');
  end if;
  execute d;
 end loop;
 update public.ch78_max_bot_config set chat_id='-72977812571458',commands_enabled=false,generation_enabled=false,sending_enabled=false,activated_at=clock_timestamp() where id;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='ch78_max_bot_config' and column_name='reaction_mode') then
  update public.ch78_max_bot_config set reaction_mode='off',reactions_activated_at=clock_timestamp() where id;
 end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='ch78_max_bot_config' and column_name='miniapp_enabled') then
  update public.ch78_max_bot_config set miniapp_enabled=false,miniapp_ai_enabled=false where id;
 end if;
end $move$;
