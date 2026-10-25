-- After applying the buttons migration and deploying BOTH bundles.
-- Uses the existing Vault-held worker secret without revealing its value.
-- Registers commands and subscribes the existing webhook to message_callback.
-- This does not enable buttons or change the profile. Inspect the queued HTTP result.
select net.http_post(
 url:='https://fnwpkmjjdhflnqghnogj.supabase.co/functions/v1/ch78-max-worker',
 headers:=jsonb_build_object('Content-Type','application/json','X-CH78-Worker-Secret',
  (select decrypted_secret from vault.decrypted_secrets where name='ch78_max_worker_secret')),
 body:='{"stage":"configure_ui"}'::jsonb,timeout_milliseconds:=60000);
