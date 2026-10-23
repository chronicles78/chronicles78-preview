-- Private, read-only operator report. No retry, approval or publication side effects.
select j.id,j.created_at at time zone 'Europe/Samara' as evaluated_at,
 j.state,j.question as post_excerpt,j.reply_text as proposed_reply_html,j.error_code,
 j.result->'usage'->>'total_tokens' as observed_total_tokens
from public.ch78_max_jobs j
where j.chat_id='-78143291213122' and j.action='reaction'
order by j.created_at desc limit 30;
