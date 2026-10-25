-- Apply only after deploying the tested migration, worker bundle and dispatch SQL.
-- Explicit authorization is required: draft evaluations consume OpenAI API tokens.
-- Drafts never enter the send queue. No historical backfill and no automatic publishing.
begin;
update public.ch78_max_bot_config
set reaction_mode='draft',reactions_activated_at=clock_timestamp()
where id and chat_id='-78143291213122';
commit;
