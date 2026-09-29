(()=>{
const shade=document.getElementById("storyAssistantShade");
if(!shade)return;
const body=document.getElementById("storyAssistantBody");
const status=document.getElementById("storyAssistantStatus");
const title=document.getElementById("storyAssistantTitle");
let state={mode:"tell",source:"",answers:[],questionCount:0,draft:""};

const escLocal=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function setStatus(msg,busy=false){status.textContent=msg||"";status.className="small storyAssistantStatus"+(busy?" busy":"")}
function open(){shade.classList.add("open");shade.setAttribute("aria-hidden","false")}
function close(){shade.classList.remove("open");shade.setAttribute("aria-hidden","true");setStatus("")}
async function invoke(action,payload={}){
 setStatus("Помощник думает…",true);
 try{
   const {data:{session}}=await sb.auth.getSession();
   if(!session?.access_token)throw new Error("Сначала войдите в архив.");
   const {data,error}=await sb.functions.invoke("story-assistant",{body:{action,...payload}});
   if(error)throw error;
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
 }
}
function startTell(seed=""){
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
function showModes(){
 body.innerHTML='<p class="storyAssistantIntro"><b>Как оформить воспоминание?</b><br>По умолчанию лучше сохранить ваш собственный голос.</p>'+
 '<div class="storyAssistantModes">'+
 '<button class="primary" data-story-mode="as_told">Как рассказал</button>'+
 '<button class="secondary" data-story-mode="tidy">Чуть причёсаннее</button>'+
 '<button class="secondary" data-story-mode="humor">С лёгким юмором</button>'+
 '<button class="secondary" data-story-mode="story">Сделать историей</button></div>';
 body.querySelectorAll("[data-story-mode]").forEach(b=>b.onclick=()=>makeDraft(b.dataset.storyMode));
}
async function makeDraft(style){
 try{
   const r=await invoke("rewrite",{source:state.source,answers:state.answers,style});
   state.draft=r.text||"";
   showDraft();
 }catch{}
}
function showDraft(){
 body.innerHTML='<p class="storyAssistantIntro"><b>Вот что получилось</b></p><div class="storyAssistantDraft">'+escLocal(state.draft)+'</div>'+
 '<div class="storyAssistantActions"><button class="primary" id="storyAssistantInsert" type="button">Вставить в сообщение</button><button class="secondary" id="storyAssistantEdit" type="button">Поправить самому</button><button class="secondary" id="storyAssistantSimplify" type="button">Сделать проще</button></div>';
 document.getElementById("storyAssistantInsert").onclick=()=>insertDraft(state.draft);
 document.getElementById("storyAssistantEdit").onclick=()=>{
   body.innerHTML='<textarea id="storyAssistantDraftEdit" class="storyAssistantInput">'+escLocal(state.draft)+'</textarea><div class="storyAssistantActions"><button class="primary" id="storyAssistantEditDone">Готово</button></div>';
   document.getElementById("storyAssistantEditDone").onclick=()=>{state.draft=document.getElementById("storyAssistantDraftEdit").value.trim();showDraft()};
 };
 document.getElementById("storyAssistantSimplify").onclick=()=>makeDraft("as_told");
}
function insertDraft(text){
 const composer=document.getElementById("composer");
 if(!composer)return;
 const existing=composer.value.trim();
 composer.value=existing?existing+"\n\n"+text:text;
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
 open();startTell(document.getElementById("composer")?.value.trim()||"");
});
document.getElementById("memoryPromptBtn")?.addEventListener("click",()=>{
 if(!user||!profile?.is_active){showView("profile");return}
 startMemory();
});
document.getElementById("storyAssistantClose")?.addEventListener("click",close);
shade.addEventListener("click",e=>{if(e.target===shade)close()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&shade.classList.contains("open"))close()});
})();