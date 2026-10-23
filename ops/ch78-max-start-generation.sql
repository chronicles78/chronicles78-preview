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
select cron.schedule('ch78-max-generate','10 seconds', $job$
 with expired as (
  update public.ch78_max_jobs set state='generation_unknown',error_code='lease_expired',
    lease=null,lease_until=null,updated_at=clock_timestamp()
  where chat_id='-78143291213122' and state='generating' and lease_until<clock_timestamp()
  returning id
 ) select net.http_post(
  url:='https://fnwpkmjjdhflnqghnogj.supabase.co/functions/v1/ch78-max-worker',
  headers:=jsonb_build_object('Content-Type','application/json','X-CH78-Worker-Secret',
    (select decrypted_secret from vault.decrypted_secrets where name='ch78_max_worker_secret')),
  body:='{"stage":"generate"}'::jsonb,timeout_milliseconds:=145000)
 from public.ch78_max_bot_config c
 where c.id and c.generation_enabled and exists(
  select 1 from public.ch78_max_jobs j where j.chat_id=c.chat_id and j.state='queued' and (j.action<>'reaction' or c.reaction_mode<>'off'));
 $job$);
update public.ch78_max_bot_config set commands_enabled=true,generation_enabled=true,
 sending_enabled=false,activated_at=clock_timestamp() where id;
select cron.schedule('ch78-max-log-retention','0 0 * * *', $retention$
 delete from cron.job_run_details
 where jobid in (select jobid from cron.job where jobname in ('ch78-max-generate','ch78-max-send'))
   and end_time < clock_timestamp()-interval '7 days';
 $retention$);
commit;
