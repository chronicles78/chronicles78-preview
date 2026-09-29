(()=>{
const shade=document.getElementById("storyAssistantShade");
if(!shade)return;
const body=document.getElementById("storyAssistantBody");
const status=document.getElementById("storyAssistantStatus");
const title=document.getElementById("storyAssistantTitle");
let pending=false, busyTimer, opener, composerSeed="";
let state={mode:"tell",source:"",answers:[],questionCount:0,draft:""};

const escLocal=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function setStatus(msg,busy=false){
 status.textContent=msg||"";status.className="storyAssistantStatus"+(busy?" busy":"");
 status.setAttribute("role","status");status.setAttribute("aria-live","polite");
}
function setBusy(active,action){
 pending=active;clearInterval(busyTimer);
 body.setAttribute("aria-busy",String(active));
 body.querySelectorAll("button,input,textarea").forEach(el=>el.disabled=active);
 body.querySelectorAll("details").forEach(el=>{if(active)el.open=false});
 if(active){
  const label=action==="rewrite"?"Помощник работает — оформляет рассказ":action==="assess"?"Помощник работает — читает воспоминание":"Помощник работает — подбирает вопрос";
  const began=Date.now();setStatus(label+"…",true);
  busyTimer=setInterval(()=>{const seconds=Math.floor((Date.now()-began)/1000);setStatus(label+"… "+seconds+" с"+(seconds>=20?". Ответ ещё готовится.":""),true)},1000);
 }
}
function open(){opener=document.activeElement;shade.classList.add("open");shade.setAttribute("aria-hidden","false")}
function close(){shade.classList.remove("open");shade.setAttribute("aria-hidden","true");opener?.focus()}
async function invoke(action,payload={}){
 if(pending)throw new Error("Запрос уже выполняется");
 setBusy(true,action);
 try{
   const {data:{session}}=await sb.auth.getSession();
   if(!session?.access_token)throw new Error("Сначала войдите в архив.");
   const {data,error}=await sb.functions.invoke("story-assistant",{body:{action,...payload}});
   if(error){
    let detail=String(error?.message||error||"");
    if(error?.context&&typeof error.context.json==="function"){
      try{
        const responseError=await error.context.json();
        detail=String(responseError?.error||responseError?.message||detail);
      }catch{}
    }
    throw new Error(detail);
   }
   if(!data||data.error)throw new Error(data?.error||"Пустой ответ помощника.");
   setStatus("");
   return data;
 }catch(e){
   const raw=String(e?.message||e||"");
   const friendly=/OPENAI_API_KEY/i.test(raw)
     ?"Помощник уже установлен, но его подключение к ИИ ещё не завершено. Ваш текст сохранён — можно продолжить позже."
     :"Не удалось обратиться к помощнику: "+raw;
   setStatus(friendly);
   throw e;
 }finally{setBusy(false)}
}
function startTell(seed=""){
 setStatus("");
 state={mode:"tell",source:seed,answers:[],questionCount:0,draft:""};
 title.textContent="Помочь рассказать";
 body.innerHTML='<p class="storyAssistantIntro">Расскажите как получается. Не думайте о красивых фразах — напишите только то, что действительно помните.</p>'+
 '<textarea id="storyAssistantInput" class="storyAssistantInput" placeholder="Например: Помню, как после уроков мы…">'+escLocal(seed)+'</textarea>'+
 '<div class="storyAssistantActions"><button class="primary" id="storyAssistantContinue" type="button">Продолжить</button></div>';
 document.getElementById("storyAssistantContinue").onclick=continueTell;
 setTimeout(()=>document.getElementById("storyAssistantInput")?.focus(),0);
}
async function continueTell(){
 const input=document.getElementById("storyAssistantInput");
 const text=(input?.value||"").trim();
 if(!text){setStatus("Напишите хотя бы одну фразу.");return}
 state.source=text;
 try{
   const r=await invoke("assess",{source:state.source,answers:state.answers,questionCount:state.questionCount});
   if(r.needQuestion&&r.question&&state.questionCount<3)showQuestion(r.question);
   else showModes();
 }catch{}
}
function showQuestion(q){
 state.questionCount++;
 body.innerHTML='<div class="storyAssistantQuestion">'+escLocal(q)+'</div>'+
 '<textarea id="storyAssistantAnswer" class="storyAssistantInput" style="min-height:100px" placeholder="Ответьте как помните. Если не уверены — так и напишите."></textarea>'+
 '<div class="storyAssistantActions"><button class="primary" id="storyAssistantAnswerBtn" type="button">Продолжить</button><button class="secondary" id="storyAssistantSkipBtn" type="button">Пропустить</button></div>';
 const next=async skip=>{
   const answer=(document.getElementById("storyAssistantAnswer")?.value||"").trim();
   if(!skip&&!answer){setStatus("Напишите ответ или нажмите «Пропустить».");return}
   if(answer)state.answers.push({question:q,answer});
   if(state.questionCount>=3){showModes();return}
   try{
     const r=await invoke("assess",{source:state.source,answers:state.answers,questionCount:state.questionCount});
     if(r.needQuestion&&r.question)showQuestion(r.question);else showModes();
   }catch{}
 };
 document.getElementById("storyAssistantAnswerBtn").onclick=()=>next(false);
 document.getElementById("storyAssistantSkipBtn").onclick=()=>next(true);
}
const modes=[
 ["as_told","Как рассказал","Исправить ошибки, сохранить ваши слова и интонацию."],
 ["tidy","Чуть причёсаннее","Убрать повторы, улучшить ритм и связность."],
 ["humor","С лёгким юмором","Подчеркнуть смешное в самой истории, сохранить подлинные реплики."],
 ["story","Сделать историей","Выстроить начало, развитие и финал без новых фактов."]
];
function modeMenu(){
 const selected=modes.find(m=>m[0]===state.style)||modes[0];
 return '<details class="storyModeMenu"><summary><span class="memoryEyebrow">ОБРАБОТКА ТЕКСТА</span><strong>'+selected[1]+'</strong><span class="storyModeHint">Раскрыть и выбрать другой режим</span></summary><div class="storyModeOptions">'+modes.map(m=>'<button type="button" data-story-mode="'+m[0]+'" aria-pressed="'+(m[0]===selected[0])+'"><strong>'+m[1]+'</strong><span>'+m[2]+'</span></button>').join('')+'</div></details>';
}
function bindModes(){body.querySelectorAll("[data-story-mode]").forEach(b=>b.onclick=()=>{if(pending)return;state.style=b.dataset.storyMode;if(state.draft)showDraft();else showModes()})}
function sourceView(){return '<details class="storySource"><summary>Ваш исходный текст</summary><div class="storyAssistantDraft">'+escLocal(state.source)+'</div></details>'}
function showModes(){
 body.innerHTML='<p class="storyAssistantIntro">Выберите, насколько заметно изменить подачу. Факты и подлинные реплики сохраняются в каждом режиме.</p>'+modeMenu()+
 '<div class="storyAssistantActions"><button class="primary" id="storyAssistantMake" type="button">Подготовить текст</button></div>'+sourceView();
 bindModes();document.getElementById("storyAssistantMake").onclick=()=>makeDraft(state.style||"as_told");
}
async function makeDraft(style){
 state.style=style;
 try{
   const r=await invoke("rewrite",{source:state.source,answers:state.answers,style});
   state.draft=r.text||"";
   showDraft();
 }catch{}
}
function showDraft(){
 body.innerHTML='<p class="storyAssistantIntro"><b>Вот что получилось</b></p><div class="storyAssistantDraft">'+escLocal(state.draft)+'</div>'+
 modeMenu()+'<div class="storyAssistantActions"><button class="primary" id="storyAssistantInsert" type="button">Вставить в сообщение</button><button class="secondary" id="storyAssistantEdit" type="button">Поправить самому</button><button class="secondary" id="storyAssistantSimplify" type="button">Применить выбранный режим</button></div>'+sourceView();
 bindModes();
 document.getElementById("storyAssistantInsert").onclick=()=>insertDraft(state.draft);
 document.getElementById("storyAssistantEdit").onclick=()=>{
   body.innerHTML='<textarea id="storyAssistantDraftEdit" class="storyAssistantInput">'+escLocal(state.draft)+'</textarea><div class="storyAssistantActions"><button class="primary" id="storyAssistantEditDone">Готово</button></div>';
   document.getElementById("storyAssistantEditDone").onclick=()=>{state.draft=document.getElementById("storyAssistantDraftEdit").value.trim();showDraft()};
 };
 document.getElementById("storyAssistantSimplify").onclick=()=>makeDraft(state.style||"as_told");
}
function insertDraft(text){
 const composer=document.getElementById("composer");
 if(!composer)return;
 const existing=composer.value.trim();
 composer.value=existing&&existing!==composerSeed?existing+"\n\n"+text:text;
 composer.dispatchEvent(new Event("input",{bubbles:true}));
 close();
 composer.focus();
}
async function startMemory(){
 state={mode:"memory",source:"",answers:[],questionCount:0,draft:""};
 title.textContent="Помоги вспомнить";
 open();
 body.innerHTML='<p class="storyAssistantIntro">Один вопрос — без анкеты и экзамена. Если тема не откликается, попросите другую.</p><div class="storyAssistantQuestion" id="memoryQuestion">Подбираю вопрос…</div><div class="storyAssistantActions"><button class="secondary" id="memoryAnother" type="button">Другой вопрос</button><button class="primary" id="memoryTell" type="button">Хочу рассказать</button></div>';
 let q="";
 const load=async()=>{
   try{const r=await invoke("memory_prompt");q=r.question||"";document.getElementById("memoryQuestion").textContent=q}catch{}
 };
 document.getElementById("memoryAnother").onclick=load;
 document.getElementById("memoryTell").onclick=()=>startTell(q?("Тема: "+q+"\n\n"):"");
 await load();
}
document.getElementById("storyAssistBtn")?.addEventListener("click",()=>{
 if(!user||!profile?.is_active){showView("profile");return}
 if(pending){open();return}
 composerSeed=document.getElementById("composer")?.value.trim()||"";
 open();startTell(composerSeed);
});
document.getElementById("memoryPromptBtn")?.addEventListener("click",()=>{
 if(!user||!profile?.is_active){showView("profile");return}
 if(pending){open();return}
 composerSeed="";
 startMemory();
});
document.getElementById("storyAssistantClose")?.addEventListener("click",close);
shade.addEventListener("click",e=>{if(e.target===shade)close()});
document.addEventListener("keydown",e=>{
 if(e.key==="Tab"&&shade.classList.contains("open")){
  const items=[...shade.querySelectorAll("button:not(:disabled),textarea:not(:disabled),summary")].filter(el=>el.getClientRects().length);
  const first=items[0],last=items[items.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
 }
 if(e.key==="Escape"&&shade.classList.contains("open"))close()});
})();
