-- Update scheduling only; preserve activation, rate limits and all enable flags.
-- Empty queues perform database maintenance only, without HTTP/model calls.
begin;
select cron.schedule('ch78-max-generate','* * * * *', $job$
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
  select 1 from public.ch78_max_jobs j where j.chat_id=c.chat_id and j.state='queued');
 $job$);
select cron.schedule('ch78-max-send','* * * * *', $job$
 with expired as (
  update public.ch78_max_jobs set state='delivery_unknown',error_code='lease_expired',
    lease=null,lease_until=null,updated_at=clock_timestamp()
  where chat_id='-78143291213122' and state='sending' and lease_until<clock_timestamp()
  returning id
 ) select net.http_post(
  url:='https://fnwpkmjjdhflnqghnogj.supabase.co/functions/v1/ch78-max-worker',
  headers:=jsonb_build_object('Content-Type','application/json','X-CH78-Worker-Secret',
    (select decrypted_secret from vault.decrypted_secrets where name='ch78_max_worker_secret')),
  body:='{"stage":"send"}'::jsonb,timeout_milliseconds:=60000)
 from public.ch78_max_bot_config c
 where c.id and c.sending_enabled and exists(
  select 1 from public.ch78_max_jobs j where j.chat_id=c.chat_id and j.state='ready');
 $job$);
commit;
