-- Read-only owner report. Known tokens are observations, not an invoice estimate.
-- Missing historical/partial usage is reported explicitly, never replaced by zero.
with scoped as (
 select (created_at at time zone 'Europe/Samara')::date as day,action,state,
  case when result->'usage'->>'version'='1' then result->'usage' end as usage
 from public.ch78_max_jobs where chat_id='-78143291213122'
), days as (
 select day,count(*) as jobs,
  count(*) filter(where action='answer') as answer_jobs,
  count(*) filter(where usage is not null) as tracked_jobs,
  count(*) filter(where usage is null) as untracked_jobs,
  count(*) filter(where usage->>'complete'='false') as incomplete_jobs,
  sum((usage->>'requests')::bigint) as tracked_model_attempts
 from scoped group by day
), observed as (
 select s.day,count(r.value) as reported_model_calls,
  sum((r.value->>'input_tokens')::bigint) as known_input_tokens,
  sum((r.value->>'output_tokens')::bigint) as known_output_tokens,
  sum((r.value->>'total_tokens')::bigint) as known_total_tokens,
  sum((r.value->>'cached_input_tokens')::bigint) as known_cached_input_tokens,
  sum((r.value->>'reasoning_tokens')::bigint) as known_reasoning_tokens
 from scoped s cross join lateral jsonb_array_elements(coalesce(s.usage->'reports','[]'::jsonb)) r(value)
 group by s.day
)
select d.*,coalesce(o.reported_model_calls,0) as reported_model_calls,
 case when o.reported_model_calls is null and d.untracked_jobs=0 and d.incomplete_jobs=0 then 0 else o.known_input_tokens end as known_input_tokens,
 case when o.reported_model_calls is null and d.untracked_jobs=0 and d.incomplete_jobs=0 then 0 else o.known_output_tokens end as known_output_tokens,
 case when o.reported_model_calls is null and d.untracked_jobs=0 and d.incomplete_jobs=0 then 0 else o.known_total_tokens end as known_total_tokens,
 case when o.reported_model_calls is null and d.untracked_jobs=0 and d.incomplete_jobs=0 then 0 else o.known_cached_input_tokens end as known_cached_input_tokens,
 case when o.reported_model_calls is null and d.untracked_jobs=0 and d.incomplete_jobs=0 then 0 else o.known_reasoning_tokens end as known_reasoning_tokens
from days d left join observed o using(day) order by day desc;
