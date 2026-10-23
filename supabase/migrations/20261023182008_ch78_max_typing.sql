-- Activate separately after worker installation and owner approval.
alter table public.ch78_max_bot_config add column typing_enabled boolean not null default false;
create function public.ch78_max_typing_gate(p_id uuid,p_lease uuid) returns boolean
language sql volatile security invoker set search_path='' as $$
 select exists(select 1 from public.ch78_max_jobs j cross join public.ch78_max_bot_config c
 where c.id and c.typing_enabled and c.commands_enabled and c.generation_enabled and c.sending_enabled
 and j.id=p_id and j.lease=p_lease and j.lease_until>clock_timestamp()
 and j.chat_id=c.chat_id and j.chat_id='-78143291213122' and j.state='generating' and j.action='answer');
$$;
revoke all on function public.ch78_max_typing_gate(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ch78_max_typing_gate(uuid,uuid) to service_role;
