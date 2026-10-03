import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const key=Deno.env.get("OPENAI_API_KEY");
  if(!key)throw new Error("OPENAI_API_KEY не настроен");
  const incoming=await req.formData();
  const audio=incoming.get("audio");
  if(!(audio instanceof File))return new Response(JSON.stringify({error:"Аудиофайл не получен"}),{status:400,headers:{...cors,"Content-Type":"application/json"}});
  if(audio.size>12*1024*1024)return new Response(JSON.stringify({error:"Запись слишком большая"}),{status:413,headers:{...cors,"Content-Type":"application/json"}});
  const fd=new FormData();
  fd.append("file",audio,audio.name||"voice.webm");
  fd.append("model","gpt-4o-mini-transcribe");
  fd.append("language","ru");
  const r=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{Authorization:"Bearer "+key},body:fd});
  const data=await r.json();
  if(!r.ok)throw new Error(data?.error?.message||"Ошибка распознавания речи");
  return new Response(JSON.stringify({text:String(data.text||"").trim()}),{headers:{...cors,"Content-Type":"application/json"}});
 }catch(e){
  return new Response(JSON.stringify({error:e instanceof Error?e.message:String(e)}),{status:500,headers:{...cors,"Content-Type":"application/json"}});
 }
});