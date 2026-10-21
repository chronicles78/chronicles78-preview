-- Apply only AFTER the dedicated worker secret exists both in Edge Secrets and
-- Vault (name ch78_max_worker_secret). Does not enable any MAX message sending.
begin;
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='ch78_max_worker_secret'
  and decrypted_secret ~ '^[A-Za-z0-9_-]{32,128}$') then
  raise exception 'Missing dedicated worker secret in Vault';
 end if;
end $$;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule('ch78-max-generate','* * * * *', $job$
 select net.http_post(
  url:='https://fnwpkmjjdhflnqghnogj.supabase.co/functions/v1/ch78-max-worker',
  headers:=jsonb_build_object('Content-Type','application/json','X-CH78-Worker-Secret',
    (select decrypted_secret from vault.decrypted_secrets where name='ch78_max_worker_secret')),
  body:='{"stage":"generate"}'::jsonb,timeout_milliseconds:=145000);
 $job$);
update public.ch78_max_bot_config set commands_enabled=true,generation_enabled=true,
 sending_enabled=false,activated_at=clock_timestamp() where id;
commit;
