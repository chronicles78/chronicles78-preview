-- After both bundles are deployed and configure_ui verified commands/subscription.
-- No change to reaction mode, model limits or profile information.
update public.ch78_max_bot_config set buttons_enabled=true where id and chat_id='-72977812571458';
