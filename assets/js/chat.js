const chatSignedCache=new Map();
async function signedImage(path){
 if(!path)return null;
 const hit=chatSignedCache.get(path);
 if(hit&&hit.expires>Date.now())return hit.url;
 const {data}=await sb.storage.from("chat-media").createSignedUrl(path,3600);
 const url=data?.signedUrl||null;
 if(url)chatSignedCache.set(path,{url,expires:Date.now()+55*60*1000});
 return url;
}
async function signedChatImages(paths){
 const unique=[...new Set((paths||[]).filter(Boolean))],out={};
 const missing=[];
 for(const path of unique){
   const hit=chatSignedCache.get(path);
   if(hit&&hit.expires>Date.now())out[path]=hit.url;
   else missing.push(path);
 }
 if(missing.length){
   const {data,error}=await sb.storage.from("chat-media").createSignedUrls(missing,3600);
   if(!error){
     (data||[]).forEach((row,i)=>{
       const path=missing[i],url=row?.signedUrl||null;
       if(url){out[path]=url;chatSignedCache.set(path,{url,expires:Date.now()+55*60*1000})}
     });
   }else{
     await Promise.all(missing.map(async path=>{const url=await signedImage(path);if(url)out[path]=url}));
   }
 }
 return out;
}
function scheduleRoomReload(delay=220){
 clearTimeout(chatReloadTimer);
 chatReloadTimer=setTimeout(()=>{if(user&&profile?.is_active)loadRoom()},delay);
}
async function loadRoom(){
 if(!user||!profile?.is_active)return;
 const seq=++chatLoadSeq,room=currentRoom;
 const {data,error}=await sb.from("messages")
  .select("id,body,created_at,edited_at,author_id,reply_to,is_evidence,is_hidden_from_publication,linked_entity_type,linked_entity_id,author:profiles!messages_author_id_fkey(display_name,role),attachments:message_attachments(id,current_storage_path,current_file_name,caption,created_by,is_removed,created_at)")
  .eq("room_id",room).order("created_at",{ascending:false}).limit(chatLoadedLimit);
 if(seq!==chatLoadSeq||room!==currentRoom)return;
 if(error){$("messages").innerHTML='<div class="notice">'+esc(error.message)+'</div>';return}
 lastMessages=(data||[]).reverse();
 const ids=lastMessages.map(x=>x.id);

 reactionRows=[];
 let readRows=[];
 if(ids.length){
   const [{data:r},{data:rr}]=await Promise.all([
     sb.from("reactions").select("message_id,user_id,emoji").in("message_id",ids),
     sb.from("message_reads").select("message_id,user_id,read_at").in("message_id",ids)
   ]);
   reactionRows=r||[];readRows=rr||[];

   const already=new Set(readRows.filter(x=>x.user_id===user.id).map(x=>x.message_id));
   const unread=lastMessages.filter(m=>m.author_id!==user.id&&!already.has(m.id)).map(m=>({message_id:m.id,user_id:user.id}));
   if(unread.length){
     const now=new Date().toISOString();
     readRows.push(...unread.map(x=>({...x,read_at:now})));
     setTimeout(()=>sb.from("message_reads").insert(unread).then(()=>{}),0);
   }
 }
 if(seq!==chatLoadSeq||room!==currentRoom)return;

 const allAttachments=lastMessages.flatMap(m=>(m.attachments||[]).filter(x=>!x.is_removed));
 const signedPromise=signedChatImages(allAttachments.map(a=>a.current_storage_path));
 const messageById=new Map(lastMessages.map(m=>[m.id,m]));
 const readCountByMessage=new Map();
 readRows.forEach(r=>{
   const authorId=messageById.get(r.message_id)?.author_id;
   if(authorId&&r.user_id!==authorId)readCountByMessage.set(r.message_id,(readCountByMessage.get(r.message_id)||0)+1);
 });
 const reactionsByMessage=new Map();
 reactionRows.forEach(r=>{
   const key=r.message_id+"|"+r.emoji;
   if(!reactionsByMessage.has(key))reactionsByMessage.set(key,[]);
   reactionsByMessage.get(key).push(r);
 });
 const olderControl=lastMessages.length>=chatLoadedLimit?'<div class="chatOlderWrap"><button class="secondary" id="loadOlderMessages" type="button">Показать более ранние сообщения</button></div>':"";

 $("messages").innerHTML=olderControl+lastMessages.map(m=>{
   const mine=m.author_id===user.id;
   const editor=profile?.role==="editor"||profile?.role==="admin";
   const canEdit=mine||editor;
   const replied=m.reply_to?messageById.get(m.reply_to):null;
   const isRead=(readCountByMessage.get(m.id)||0)>0;

   const reactions=["👍","❤️","😂"].map(e=>{
      const rows=reactionsByMessage.get(m.id+"|"+e)||[], on=rows.some(r=>r.user_id===user.id);
      return rows.length?'<button class="reactionChip '+(on?"on":"")+'" data-react="'+e+'" data-mid="'+m.id+'">'+e+' '+rows.length+'</button>':"";
   }).join("");

   const liveAttachments=(m.attachments||[]).filter(a=>!a.is_removed);
   const photos=liveAttachments.map(a=>
     '<div class="attachmentWrap">'+
       '<div class="notice" data-chat-photo-wait="'+a.id+'">Фото загружается…</div>'+
       '<img class="attachment" data-chat-photo="'+a.id+'" alt="'+esc(a.current_file_name||"Фото")+'" style="display:none">'+
       (a.caption?'<div class="caption">'+esc(a.caption)+'</div>':'')+
     '</div>'
   ).join("");

   const photoActions=liveAttachments.map((a,idx)=>
     '<div class="menuLabel">Фото '+(idx+1)+'</div>'+
     (canEdit?'<button class="menuBtn" data-photo-replace="'+a.id+'">Заменить</button><button class="menuBtn" data-photo-caption="'+a.id+'">Изменить подпись</button><button class="menuBtn" data-photo-remove="'+a.id+'">Убрать</button>':'')+
     '<button class="menuBtn" data-photo-history="'+a.id+'">История версий</button>'+
     (editor?'<button class="menuBtn" data-photo-archive="'+a.id+'" data-mid="'+m.id+'">В фотоархив</button>':'')
   ).join("");

   const menuPanel=
     '<div class="msgMenuPanel">'+
       '<button class="menuBtn" data-reply="'+m.id+'">↩ Ответить</button>'+
       (m.body?'<button class="menuBtn" data-copy-message="'+m.id+'">⧉ Копировать текст</button>':'')+
       '<div class="menuSep"></div>'+
       '<button class="menuBtn" data-react="👍" data-mid="'+m.id+'">👍 Нравится</button>'+
       '<button class="menuBtn" data-react="❤️" data-mid="'+m.id+'">❤️ Сердце</button>'+
       '<button class="menuBtn" data-react="😂" data-mid="'+m.id+'">😂 Смешно</button>'+
       (!mine?'<button class="menuBtn" data-report-message="'+m.id+'">⚑ Пожаловаться</button>':'')+
       (canEdit?'<div class="menuSep"></div><button class="menuBtn" data-edit-message="'+m.id+'">✎ Редактировать</button><button class="menuBtn" data-photo-add="'+m.id+'">＋ Добавить фото</button>':'')+
       (photoActions?'<div class="menuSep"></div>'+photoActions:'')+
       (editor?'<div class="menuSep"></div><button class="menuBtn" data-evidence="'+m.id+'">'+(m.is_evidence?"★ Убрать из свидетельств":"☆ В свидетельство")+'</button><button class="menuBtn" data-link="'+m.id+'">🔗 Связать с историей</button><button class="menuBtn" data-question="'+m.id+'">? Создать вопрос</button><button class="menuBtn" data-hide="'+m.id+'">'+(m.is_hidden_from_publication?"Вернуть в публикацию":"Не публиковать")+'</button>':'')+
     '</div>';

   const time=new Date(m.created_at).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
   const receipt=mine?'<span class="receiptChecks '+(isRead?"read":"")+'">'+(isRead?"✓✓":"✓")+'</span>':"";
   const editTitle=m.edited_at?' title="Сообщение изменено"':"";

   return '<div class="msg '+(mine?"mine":"")+'"><div class="bubble" data-mid="'+m.id+'">'+
     (!mine?'<div class="who">'+esc(m.author?.display_name||"Участник")+'</div>':'')+
     (replied?'<div class="replyQuote"><b>'+esc(replied.author?.display_name||"Участник")+'</b><br>'+esc((replied.body||"Фото").slice(0,100))+'</div>':'')+
     (m.body?'<div class="messageBody">'+esc(m.body)+'</div>':'')+
     photos+
     (reactions?'<div class="reactionStrip">'+reactions+'</div>':'')+
     '<div class="msgFoot">'+
       (m.linked_entity_id?'<div class="linked">↗ <button class="tagLink" data-tag="'+esc(m.linked_entity_id)+'">'+esc(m.linked_entity_type||"архив")+' · '+esc(m.linked_entity_id)+'</button></div>':'')+
       '<details class="footMenu"><summary data-menu-trigger="'+m.id+'"'+editTitle+'><span>'+time+'</span>'+receipt+'</summary>'+menuPanel+'</details>'+
     '</div></div></div>';
 }).join("")||'<div class="notice">В этой комнате пока нет сообщений.</div>';

 if($("loadOlderMessages"))$("loadOlderMessages").onclick=async()=>{
   const beforeHeight=$("messages").scrollHeight,beforeTop=$("messages").scrollTop;
   chatLoadedLimit+=80;
   await loadRoom();
   requestAnimationFrame(()=>$("messages").scrollTop=Math.max(0,$("messages").scrollHeight-beforeHeight+beforeTop));
 };
 $("messages").querySelectorAll("[data-menu-trigger]").forEach(s=>{
   s.onclick=e=>e.preventDefault();
 });
 $("messages").querySelectorAll(".bubble[data-mid]").forEach(bubble=>{
   let timer=null,startX=0,startY=0,opened=false;
   const openMenu=()=>{
     const d=bubble.querySelector("details.footMenu");
     if(!d)return;
     $("messages").querySelectorAll("details.footMenu[open]").forEach(x=>{if(x!==d)x.removeAttribute("open")});
     d.setAttribute("open","");
     bubble.classList.remove("longPressing");
     opened=true;
   };
   const cancel=()=>{
     if(timer){clearTimeout(timer);timer=null}
     bubble.classList.remove("longPressing");
   };
   bubble.addEventListener("pointerdown",e=>{
     if(e.pointerType==="mouse"&&e.button!==0)return;
     if(e.target.closest("button,a,input,textarea,select,summary"))return;
     startX=e.clientX;startY=e.clientY;opened=false;
     bubble.classList.add("longPressing");
     timer=setTimeout(openMenu,650);
   });
   bubble.addEventListener("pointermove",e=>{
     if(!timer)return;
     if(Math.abs(e.clientX-startX)>12||Math.abs(e.clientY-startY)>12)cancel();
   });
   bubble.addEventListener("pointerup",e=>{
     const wasOpened=opened;
     cancel();
     if(wasOpened){e.preventDefault();e.stopPropagation()}
   });
   bubble.addEventListener("pointercancel",cancel);
   bubble.addEventListener("pointerleave",e=>{if(e.pointerType==="mouse")cancel()});
   bubble.addEventListener("contextmenu",e=>{
     e.preventDefault();
     openMenu();
   });
 });

 $("messages").querySelectorAll(".msgMenuPanel button").forEach(b=>b.addEventListener("click",()=>b.closest("details")?.removeAttribute("open")));
 $("messages").querySelectorAll("[data-reply]").forEach(b=>b.onclick=()=>{replyTo=b.dataset.reply;renderReply();$("composer").focus()});
 $("messages").querySelectorAll("[data-copy-message]").forEach(b=>b.onclick=async()=>{const m=lastMessages.find(x=>x.id===b.dataset.copyMessage);if(m?.body)await navigator.clipboard.writeText(m.body)});
 $("messages").querySelectorAll("[data-react]").forEach(b=>b.onclick=()=>toggleReaction(b.dataset.mid,b.dataset.react));
 $("messages").querySelectorAll("[data-report-message]").forEach(b=>b.onclick=()=>reportContent("message",b.dataset.reportMessage));
 $("messages").querySelectorAll("[data-evidence]").forEach(b=>b.onclick=()=>toggleEditorialFlag(b.dataset.evidence,"is_evidence"));
 $("messages").querySelectorAll("[data-hide]").forEach(b=>b.onclick=()=>toggleEditorialFlag(b.dataset.hide,"is_hidden_from_publication"));
 $("messages").querySelectorAll("[data-link]").forEach(b=>b.onclick=()=>linkStory(b.dataset.link));
 $("messages").querySelectorAll("[data-question]").forEach(b=>b.onclick=()=>createQuestionFromMessage(b.dataset.question));
 $("messages").querySelectorAll("[data-edit-message]").forEach(b=>b.onclick=()=>editMessageText(b.dataset.editMessage));
 $("messages").querySelectorAll("[data-photo-add]").forEach(b=>b.onclick=()=>startPhotoAction("add",null,b.dataset.photoAdd));
 $("messages").querySelectorAll("[data-photo-replace]").forEach(b=>b.onclick=()=>startPhotoAction("replace",b.dataset.photoReplace,null));
 $("messages").querySelectorAll("[data-photo-caption]").forEach(b=>b.onclick=()=>editPhotoCaption(b.dataset.photoCaption));
 $("messages").querySelectorAll("[data-photo-remove]").forEach(b=>b.onclick=()=>removePhotoAttachment(b.dataset.photoRemove));
 $("messages").querySelectorAll("[data-photo-history]").forEach(b=>b.onclick=()=>showPhotoVersions(b.dataset.photoHistory));
 $("messages").querySelectorAll("[data-photo-archive]").forEach(b=>b.onclick=()=>archivePhotoFromChat(b.dataset.photoArchive,b.dataset.mid));

 signedPromise.then(signedByPath=>{
   if(seq!==chatLoadSeq||room!==currentRoom)return;
   allAttachments.forEach(a=>{
     const img=$("messages").querySelector('[data-chat-photo="'+CSS.escape(String(a.id))+'"]');
     const wait=$("messages").querySelector('[data-chat-photo-wait="'+CSS.escape(String(a.id))+'"]');
     const url=signedByPath[a.current_storage_path]||null;
     if(url&&img){
       img.src=url;
       img.style.display="";
       wait?.remove();
     }else if(wait){
       wait.textContent="Фото недоступно.";
     }
   });
 }).catch(()=>{});

 requestAnimationFrame(()=>$("messages").scrollTop=$("messages").scrollHeight);
}
function renderReply(){
 if(replyTo){const m=lastMessages.find(x=>x.id===replyTo);$("replying").textContent="Ответ: "+(m?.author?.display_name||"сообщение")+" — "+((m?.body||"Фото").slice(0,55));$("cancelReply").style.display="inline-block"}
 else {
   const bits=[];
   if(questionDiscussion)bits.push("Обсуждение: "+questionDiscussion.label);
   if(pendingFiles.length)bits.push("Фото: "+pendingFiles.length);
   $("replying").textContent=bits.join(" · ");
   $("cancelReply").style.display=questionDiscussion?"inline-block":"none";
 }
}
$("cancelReply").onclick=()=>{replyTo=null;questionDiscussion=null;renderReply()};

async function editMessageText(mid){
 const m=lastMessages.find(x=>x.id===mid);if(!m)return;
 openPhotoModal("Редактировать сообщение",
   '<label>Текст сообщения</label><textarea id="pfMessageEdit" style="min-height:180px">'+esc(m.body||"")+'</textarea>'+
   '<div class="formHint">Предыдущие версии текста сохраняются. После изменения в чате появится отметка «изменено».</div>'+
   '<button class="secondary" type="button" id="pfMessageVersions">История изменений</button>',
   async()=>{
     const body=$("pfMessageEdit").value.trim();
     if(!body)throw new Error("Сообщение не может быть пустым.");
     const {error}=await sb.rpc("edit_message_text",{p_message_id:mid,p_body:body});
     if(error)throw error;
     await loadRoom();
   }
 );
 $("pfMessageVersions").onclick=()=>showMessageVersions(mid);
}
async function showMessageVersions(mid){
 const {data,error}=await sb.from("message_versions").select("version_no,body,created_at,edited_by").eq("message_id",mid).order("version_no",{ascending:false});
 if(error){alert(error.message);return}
 if(!data?.length){alert("Изменений пока нет.");return}
 openPhotoModal("История изменений",
   data.map(v=>'<div class="storyEvidence"><b>Версия '+v.version_no+'</b><div class="small">'+new Date(v.created_at).toLocaleString("ru-RU")+'</div><div style="white-space:pre-wrap;margin-top:6px">'+esc(v.body)+'</div></div>').join(""),
   async()=>{}
 );
 $("photoModalSave").textContent="Закрыть";
 photoModalSubmit=async()=>{closePhotoModal()};
}
async function toggleReaction(mid,emoji){
 const exists=reactionRows.some(r=>r.message_id===mid&&r.user_id===user.id&&r.emoji===emoji);
 if(exists) await sb.from("reactions").delete().eq("message_id",mid).eq("user_id",user.id).eq("emoji",emoji);
 else await sb.from("reactions").insert({message_id:mid,user_id:user.id,emoji});
 await loadRoom();
}
$("attachBtn").onclick=()=>$("fileInput").click();
$("fileInput").onchange=()=>{
 const picked=[...($("fileInput").files||[])];
 const bad=picked.find(f=>f.size>8*1024*1024);
 if(bad){alert("Максимальный размер одного фото — 8 МБ: "+bad.name);$("fileInput").value="";return}
 pendingFiles=picked.slice(0,10);
 if(picked.length>10)alert("В одно сообщение можно добавить до 10 фотографий.");
 renderReply();
};

function safeName(name){return String(name||"photo.jpg").replace(/[^a-zA-Z0-9._-]/g,"_")}
function imageMimeFromFile(file){
 const name=String(file?.name||"").toLowerCase();
 if(name.endsWith(".jpg")||name.endsWith(".jpeg"))return "image/jpeg";
 if(name.endsWith(".png"))return "image/png";
 if(name.endsWith(".webp"))return "image/webp";
 return null;
}
function ensureImageFile(file){
 const mime=imageMimeFromFile(file);
 if(!mime)throw new Error("Выбран не файл изображения. Нужен JPG, JPEG, PNG или WEBP.");
 return mime;
}
const ARCHIVE_ORIGINAL_MAX_BYTES=25*1024*1024;
const ARCHIVE_MAX_SIDE=1920;
const ARCHIVE_WEBP_QUALITY=.82;
async function compressArchiveImageFallback(file){
 const mime=ensureImageFile(file);
 const url=URL.createObjectURL(file);
 try{
   const img=new Image();
   img.decoding="async";
   await new Promise((resolve,reject)=>{
     img.onload=resolve;
     img.onerror=()=>reject(new Error("Не удалось прочитать изображение в браузере."));
     img.src=url;
   });
   const sourceWidth=img.naturalWidth||img.width,sourceHeight=img.naturalHeight||img.height;
   if(!(sourceWidth>0&&sourceHeight>0))throw new Error("Не удалось определить размер изображения.");
   const scale=Math.min(1,ARCHIVE_MAX_SIDE/Math.max(sourceWidth,sourceHeight));
   const width=Math.max(1,Math.round(sourceWidth*scale)),height=Math.max(1,Math.round(sourceHeight*scale));
   const canvas=document.createElement("canvas");
   canvas.width=width;canvas.height=height;
   const ctx=canvas.getContext("2d",{alpha:false});
   if(!ctx)throw new Error("Браузер не может подготовить рабочую копию.");
   ctx.drawImage(img,0,0,width,height);
   let blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",ARCHIVE_WEBP_QUALITY));
   let outMime="image/webp",ext="webp";
   if(!blob||blob.type!=="image/webp"){
     blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.84));
     outMime="image/jpeg";ext="jpg";
   }
   if(!blob)throw new Error("Не удалось сжать изображение.");
   return {blob,outMime,ext,width,height,sourceWidth,sourceHeight,inputMime:mime};
 }finally{URL.revokeObjectURL(url)}
}
async function uploadChatFile(file){
 const mime=ensureImageFile(file);
 const path=user.id+"/"+Date.now()+"-"+Math.random().toString(36).slice(2,8)+"-"+safeName(file.name);
 const {error}=await sb.storage.from("chat-media").upload(path,file,{contentType:mime,upsert:false});
 if(error)throw error;
 return {path,name:file.name};
}
async function addAttachmentToMessage(messageId,file){
 const up=await uploadChatFile(file);
 const {data:a,error}=await sb.from("message_attachments").insert({
   message_id:messageId,current_storage_path:up.path,current_file_name:up.name,created_by:user.id
 }).select("id").single();
 if(error)throw error;
 const {error:ve}=await sb.from("message_attachment_versions").insert({
   attachment_id:a.id,version_no:1,storage_path:up.path,file_name:up.name,reason:"Исходное вложение",created_by:user.id
 });
 if(ve)throw ve;
}
async function send(){
 const t=$("composer").value.trim();if(!t&&!pendingFiles.length)return;
 $("sendBtn").disabled=true;
 try{
   const row={room_id:currentRoom,author_id:user.id,body:t||"",reply_to:replyTo||null};
   if(questionDiscussion){row.linked_entity_type="question";row.linked_entity_id=questionDiscussion.id}
   const {data:m,error}=await sb.from("messages").insert(row).select("id").single();
   if(error)throw error;
   for(const file of pendingFiles)await addAttachmentToMessage(m.id,file);
   $("composer").value="";$("fileInput").value="";pendingFiles=[];replyTo=null;questionDiscussion=null;renderReply();await loadRoom();
 }catch(e){alert("Не отправлено: "+(e.message||e))}
 finally{$("sendBtn").disabled=false}
}
$("sendBtn").onclick=send;$("composer").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}});

function startPhotoAction(type,attachmentId,messageId){
 photoAction={type,attachmentId,messageId};
 $("photoActionInput").value="";
 $("photoActionInput").click();
}
$("photoActionInput").onchange=async()=>{
 const file=$("photoActionInput").files?.[0];if(!file||!photoAction)return;
 if(file.size>8*1024*1024){alert("Максимальный размер фото — 8 МБ.");photoAction=null;return}
 if(photoAction.type==="add"){
   try{await addAttachmentToMessage(photoAction.messageId,file);await loadRoom()}
   catch(e){alert("Фото не добавлено: "+(e.message||e))}
   finally{photoAction=null;$("photoActionInput").value=""}
   return;
 }
 if(photoAction.type==="replace"){
   const action={...photoAction}; photoAction=null;
   openPhotoModal("Заменить фотографию",
     '<div class="notice">Новый файл: <b>'+esc(file.name)+'</b></div>'+
     '<label>Причина замены</label><select id="pfReason">'+
       '<option>Более качественная версия</option><option>Найден оригинал</option><option>Лучший скан</option><option>Исправлена ориентация</option><option>Другая причина</option>'+
     '</select>'+
     '<label>Комментарий</label><textarea id="pfReasonNote" placeholder="При необходимости уточните причину"></textarea>',
     async()=>{
       const reason=$("pfReason").value+($("pfReasonNote").value.trim()?" — "+$("pfReasonNote").value.trim():"");
       const up=await uploadChatFile(file);
       const {error}=await sb.rpc("replace_message_attachment_version",{
         p_attachment_id:action.attachmentId,p_storage_path:up.path,p_file_name:up.name,p_reason:reason
       });
       if(error)throw error;
       $("photoActionInput").value="";
       await loadRoom();
     }
   );
 }
};
async function editPhotoCaption(id){
 const m=lastMessages.flatMap(x=>x.attachments||[]).find(a=>a.id===id);
 openPhotoModal("Подпись к фотографии",
   '<label>Подпись</label><textarea id="pfCaption" placeholder="Что изображено, где, когда…">'+esc(m?.caption||"")+'</textarea>'+
   '<div class="formHint">Подпись относится к фотографии в чате и может быть уточнена позднее.</div>',
   async()=>{
     const cap=$("pfCaption").value.trim();
     const {error}=await sb.from("message_attachments").update({caption:cap,updated_at:new Date().toISOString()}).eq("id",id);
     if(error)throw error;
     await loadRoom();
   }
 );
}
async function removePhotoAttachment(id){
 if(!confirm("Убрать фотографию из сообщения? Файл и история версий сохранятся."))return;
 const {error}=await sb.from("message_attachments").update({is_removed:true,updated_at:new Date().toISOString()}).eq("id",id);
 if(error)alert(error.message);else loadRoom();
}
async function showPhotoVersions(id){
 const {data,error}=await sb.from("message_attachment_versions").select("version_no,file_name,reason,created_at").eq("attachment_id",id).order("version_no",{ascending:false});
 if(error){alert(error.message);return}
 alert((data||[]).map(v=>"v"+v.version_no+" · "+(v.file_name||"файл")+"\n"+(v.reason||"")+"\n"+new Date(v.created_at).toLocaleString("ru-RU")).join("\n\n")||"История версий пуста.");
}
async function fileDimensions(file){
 try{
   const bmp=await createImageBitmap(file);const x={width:bmp.width,height:bmp.height};bmp.close();return x;
 }catch{return {width:null,height:null}}
}
async function nextMediaId(){
 const {data}=await sb.from("archive_media").select("id");
 const nums=(data||[]).map(x=>Number(String(x.id).match(/MEDIA-(\d+)/)?.[1]||0));
 return "MEDIA-"+String(Math.max(0,...nums)+1).padStart(3,"0");
}
async function archivePhotoFromChat(attachmentId,messageId){
 if(!(profile?.role==="editor"||profile?.role==="admin"))return;
 const a=lastMessages.flatMap(x=>x.attachments||[]).find(x=>x.id===attachmentId);if(!a)return;
 const msg=lastMessages.find(x=>x.id===messageId);
 const {stories,people}=await archiveFormLookups();
 const {data:mediaRows}=await sb.from("archive_media").select("id,title").order("id");
 const mediaOptions=(mediaRows||[]).map(m=>'<option value="'+esc(m.id)+'">'+esc(m.id+" — "+m.title)+'</option>').join("");
 openPhotoModal("Передать фотографию в архив",
   '<label>Что делаем?</label><select id="pfMode"><option value="new">Новое фото — создать карточку</option><option value="version">Новая версия существующего фото</option></select>'+
   '<div id="pfExistingWrap" style="display:none"><label>Существующая карточка</label><select id="pfExisting"><option value="">— выберите —</option>'+mediaOptions+'</select></div>'+
   '<div id="pfNewWrap"><label>Название новой фотографии</label><input id="pfTitle" value="'+esc(a.caption||"Новая фотография")+'"></div>'+
   '<label>Качество / тип версии</label>'+qualitySelectHtml("копия")+
   '<label>Источник / кто предоставил</label><input id="pfSource" value="'+esc(msg?.author?.display_name||"")+'">'+
   '<label>Причина поступления</label><input id="pfReason" value="Перенесено из чата">'+
   '<label>Связанная история</label>'+storySelectHtml(stories,msg?.linked_entity_type==="story"?msg.linked_entity_id:"")+
   '<label>Люди на фотографии</label>'+peopleChecksHtml(people,[]),
   async()=>{
     const mode=$("pfMode").value;
     let mediaId=$("pfExisting")?.value||"";
     if(mode==="new"){
       mediaId=await nextMediaId();
       const title=$("pfTitle").value.trim(); if(!title)throw new Error("Укажите название.");
       const {error}=await sb.from("archive_media").insert({
         id:mediaId,title,category:"архивное фото",archive_file:a.current_file_name,
         linked_story:$("pfStory").value||null,
         data:{source_message_id:messageId,source_attachment_id:attachmentId,people:selectedPeople(),identification_status:"требует описания"},
         visibility:"members",quality_status:$("pfQuality").value,source_note:$("pfSource").value.trim()
       });
       if(error)throw error;
     }else if(!mediaId)throw new Error("Выберите существующую карточку.");
     const {data:blob,error:de}=await sb.storage.from("chat-media").download(a.current_storage_path);if(de)throw de;
     const mime=imageMimeFromFile({name:a.current_file_name})||blob.type||"image/jpeg";
     const chatFile=new File([blob],a.current_file_name||"photo.jpg",{type:mime});
     await uploadArchiveVersion(
       mediaId,chatFile,$("pfQuality").value,
       $("pfReason").value.trim()||"Перенесено из чата",
       $("pfSource").value.trim()||null
     );
     if(mode==="version"){
       const {data:row}=await sb.from("archive_media").select("data,linked_story").eq("id",mediaId).maybeSingle();
       const next={...(row?.data||{})};
       const peopleNow=selectedPeople(); if(peopleNow.length)next.people=[...new Set([...(next.people||[]),...peopleNow])];
       const {error:me}=await sb.from("archive_media").update({data:next,linked_story:$("pfStory").value||row?.linked_story||null,source_note:$("pfSource").value.trim()||null,updated_at:new Date().toISOString()}).eq("id",mediaId);
       if(me)throw me;
     }
     mediaFocus=mediaId;
   }
 );
 const modeEl=$("pfMode"), ex=$("pfExistingWrap"), nw=$("pfNewWrap");
 modeEl.onchange=()=>{const isNew=modeEl.value==="new";ex.style.display=isNew?"none":"block";nw.style.display=isNew?"block":"none"};
}
function subscribe(){
 if(!user||!profile?.is_active)return;
 if(unsubMsg)unsubMsg();if(unsubReact)unsubReact();if(unsubRead)unsubRead();
 const room=currentRoom;
 const ch1=sb.channel("msg-"+room+"-"+Date.now()).on("postgres_changes",{event:"*",schema:"public",table:"messages",filter:"room_id=eq."+room},()=>{if(currentRoom===room)scheduleRoomReload(120)}).subscribe(s=>{if(s==="SUBSCRIBED")setStatus("Онлайн · realtime");if(s==="CHANNEL_ERROR"||s==="TIMED_OUT")setStatus("Онлайн · без realtime")});
 const ch2=sb.channel("react-"+room+"-"+Date.now()).on("postgres_changes",{event:"*",schema:"public",table:"reactions"},()=>{if(currentRoom===room)scheduleRoomReload(160)}).subscribe();
 unsubMsg=()=>sb.removeChannel(ch1);unsubReact=()=>sb.removeChannel(ch2);unsubRead=null;
}
