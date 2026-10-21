-- Separate explicit owner approval required before applying: publishes responses
-- to owner /ask and /find commands in the agreed MAX group.
begin;
select cron.schedule('ch78-max-send','* * * * *', $job$
 select net.http_post(
  url:='https://fnwpkmjjdhflnqghnogj.supabase.co/functions/v1/ch78-max-worker',
  headers:=jsonb_build_object('Content-Type','application/json','X-CH78-Worker-Secret',
    (select decrypted_secret from vault.decrypted_secrets where name='ch78_max_worker_secret')),
  body:='{"stage":"send"}'::jsonb,timeout_milliseconds:=60000);
 $job$);
update public.ch78_max_bot_config set sending_enabled=true where id;
commit;
