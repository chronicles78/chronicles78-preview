const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};

const systemPrompt=`Ты — помощник участников проекта «Хроники-78», посвящённого выпускникам школы №78 Куйбышева.
Ты не автор воспоминания. Автор — участник проекта.
Помогай человеку вспомнить подробности и ясно изложить только его собственное воспоминание.
Никогда не придумывай факты, события, имена, даты, места, реплики, эмоции или обстоятельства.
Сохраняй слова неопределённости: «кажется», «вроде», «по-моему» и аналогичные.
Не исправляй память человека на основании собственных знаний.
Сохраняй индивидуальную лексику и простоту речи. Не имитируй стиль редактора проекта.
Если материала мало, задавай один короткий естественный вопрос за раз; максимум три вопроса.
Не добавляй выводов от имени автора.`;

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,"Content-Type":"application/json"}})}
function extractText(data){
  if(typeof data?.output_text==="string")return data.output_text.trim();
  const parts=[];
  for(const item of data?.output||[])for(const c of item?.content||[])if(typeof c?.text==="string")parts.push(c.text);
  return parts.join("\n").trim();
}
async function callModel(instruction,input){
 const key=Deno.env.get("OPENAI_API_KEY");
 if(!key)throw new Error("На сервере не настроен OPENAI_API_KEY.");
 const model=Deno.env.get("STORY_ASSISTANT_MODEL")||"gpt-5-mini";
 const res=await fetch("https://api.openai.com/v1/responses",{
   method:"POST",
   headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},
   body:JSON.stringify({model,instructions:systemPrompt+"\n"+instruction,input})
 });
 const data=await res.json();
 if(!res.ok)throw new Error(data?.error?.message||"Ошибка AI API.");
 return extractText(data);
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
   const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
   const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
   const auth=req.headers.get("Authorization")||"";
   if(!auth)return json({error:"Требуется вход в архив."},401);
   const u=await fetch(supabaseUrl+"/auth/v1/user",{headers:{"Authorization":auth,"apikey":anon}});
   if(!u.ok)return json({error:"Сессия пользователя недействительна."},401);

   const body=await req.json();
   const action=body?.action;
   if(action==="memory_prompt"){
     const raw=await callModel(
       "Предложи один короткий, конкретный и тёплый вопрос, который может вызвать личное школьное воспоминание. Темы чередуй: уроки, перемены, дорога в школу, учителя, друзья, музыка, выпускной, Куйбышев, Волга, дворы, вещи и привычки эпохи. Верни только вопрос.",
       "Нужен новый вопрос для участника архива."
     );
     return json({question:raw.replace(/^["«]|["»]$/g,"")});
   }
   const source=String(body?.source||"").trim().slice(0,12000);
   const answers=Array.isArray(body?.answers)?body.answers.slice(0,3):[];
   if(!source)return json({error:"Нет исходного рассказа."},400);
   const context="Исходный рассказ:\n"+source+"\n\nУточнения:\n"+answers.map((x:any)=>"Вопрос: "+x.question+"\nОтвет: "+x.answer).join("\n\n");

   if(action==="assess"){
     const count=Math.max(0,Math.min(3,Number(body?.questionCount)||0));
     const raw=await callModel(
       `Оцени, достаточно ли материала для короткого связного воспоминания. Если существенная конкретная деталь может сделать рассказ живее и задано меньше трёх вопросов, задай ровно один вопрос. Не выспрашивай то, без чего рассказ уже работает. Ответь строго JSON без markdown: {"needQuestion":true|false,"question":"..."}.`,
       context+"\nУже задано вопросов: "+count
     );
     let parsed;
     try{parsed=JSON.parse(raw)}catch{parsed={needQuestion:false,question:""}}
     return json({needQuestion:!!parsed.needQuestion,question:String(parsed.question||"").slice(0,500)});
   }
   if(action==="rewrite"){
     const style=String(body?.style||"as_told");
     const rules:any={
       as_told:"Минимальная редактура: исправь орфографию, пунктуацию и явные сбои связности. Максимально сохрани исходные слова, простоту и интонацию.",
       tidy:"Слегка убери повторы и улучши связность и абзацы, но сохрани лексику и голос автора.",
       humor:"Добавь только очень лёгкую доброжелательную иронию, если она естественно вытекает из материала. Не придумывай новых событий или шуток от имени автора.",
       story:"Собери небольшой законченный рассказ с ясной композицией, используя исключительно сообщённые автором факты и ощущения."
     };
     const text=await callModel((rules[style]||rules.as_told)+" Верни только готовый текст, без комментариев и заголовков.",context);
     return json({text});
   }
   return json({error:"Неизвестное действие."},400);
 }catch(e){return json({error:e instanceof Error?e.message:String(e)},500)}
});