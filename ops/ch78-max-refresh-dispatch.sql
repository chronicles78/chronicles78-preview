-- Update scheduling only; preserve activation, rate limits and all enable flags.
-- Empty queues perform database maintenance only, without HTTP/model calls.
begin;
select cron.schedule('ch78-max-generate','10 seconds', $job$
 with expired as (
  update public.ch78_max_jobs set state='generation_unknown',error_code='lease_expired',
    lease=null,lease_until=null,updated_at=clock_timestamp()
  where chat_id='-72977812571458' and state='generating' and lease_until<clock_timestamp()
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
select cron.schedule('ch78-max-send','10 seconds', $job$
 with expired as (
  update public.ch78_max_jobs set state='delivery_unknown',error_code='lease_expired',
    lease=null,lease_until=null,updated_at=clock_timestamp()
  where chat_id='-72977812571458' and state='sending' and lease_until<clock_timestamp()
  returning id
 ) select net.http_post(
  url:='https://fnwpkmjjdhflnqghnogj.supabase.co/functions/v1/ch78-max-worker',
  headers:=jsonb_build_object('Content-Type','application/json','X-CH78-Worker-Secret',
    (select decrypted_secret from vault.decrypted_secrets where name='ch78_max_worker_secret')),
  body:='{"stage":"send"}'::jsonb,timeout_milliseconds:=60000)
 from public.ch78_max_bot_config c
 where c.id and c.sending_enabled and exists(
  select 1 from public.ch78_max_jobs j where j.chat_id=c.chat_id and j.state='ready' and (j.action<>'reaction' or (c.reaction_mode='auto' and not j.review_required)));
 $job$);
select cron.schedule('ch78-max-log-retention','0 0 * * *', $retention$
 delete from cron.job_run_details
 where jobid in (select jobid from cron.job where jobname in ('ch78-max-generate','ch78-max-send'))
   and end_time < clock_timestamp()-interval '7 days';
 $retention$);
commit;
