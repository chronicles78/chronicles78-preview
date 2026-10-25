-- Service-only lookup after signed MAX identity and current membership checks.
-- No new claim, insertion, model invocation or daily budget consumption.
create function public.ch78_max_miniapp_recover(p_user_id text,p_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.ch78_max_bot_config; r public.ch78_max_miniapp_requests; t timestamptz:=clock_timestamp();
begin
 if p_user_id is null or p_user_id !~ '^[1-9][0-9]{0,15}$' then return jsonb_build_object('kind','none'); end if;
 perform pg_catalog.pg_advisory_xact_lock(78143291213123);
 select * into c from public.ch78_max_bot_config where id and chat_id='-78143291213122';
 if not found or not c.miniapp_enabled then return jsonb_build_object('kind','disabled'); end if;
 select * into r from public.ch78_max_miniapp_requests
 where chat_id=c.chat_id and user_id=p_user_id and created_at>t-interval '7 days'
 and (p_id is null or id=p_id)
 order by created_at desc,id desc limit 1;
 if not found then return jsonb_build_object('kind','none'); end if;
 if r.state='processing' and r.created_at<t-interval '120 seconds' then
  update public.ch78_max_miniapp_requests set state='unknown' where id=r.id and state='processing';
  r.state:='unknown';
 end if;
 return jsonb_build_object('kind',r.state,'id',r.id,'action',r.action,
 'result',case when r.state in ('done','failed') then r.result else null end);
end $$;
revoke all on function public.ch78_max_miniapp_recover(text,uuid) from public,anon,authenticated;
grant execute on function public.ch78_max_miniapp_recover(text,uuid) to service_role;
