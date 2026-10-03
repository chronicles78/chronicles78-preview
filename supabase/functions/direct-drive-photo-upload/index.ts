import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() => new Response(
  JSON.stringify({ ok: false, error: "decommissioned", detail: "Пакетная загрузка фотографий удалена из проекта." }),
  { status: 410, headers: { "Content-Type": "application/json; charset=utf-8" } }
));