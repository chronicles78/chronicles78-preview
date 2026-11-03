module.exports=function seedUiAudit(){
 const paragraphs=Array.from({length:12},(_,i)=>'Абзац '+(i+1)+'. Это синтетическое воспоминание для проверки книжной типографики, ширины колонки и спокойного ритма чтения. После школьного звонка мы шли по знакомой улице к Волге, обсуждали уроки и строили планы. Текст не описывает реальных участников и не сохраняется в архиве.').join('\n\n');
 const people=['10А','10Б'].flatMap((group,gi)=>Array.from({length:4},(_,i)=>({id:'10'+(gi?'B':'A')+'-0'+(i+1),number:i+1,group_name:group,canonical_name:i===3?'Не установлено':'Тестовый участник '+group+' '+(i+1),aliases:['Ученик '+(i+1)],identification_status:i===3?'не установлено':'подтверждено',data:{media_links:[{media_id:'P-001'}]}})));
 const photos=Array.from({length:6},(_,i)=>({id:'P-00'+(i+1),media_type:'photo',title:['Общая фотография класса','Вертикальный снимок','Горизонтальная панорама','Прогулка по городу','Школьный двор','Встреча одноклассников'][i],category:i<3?'Школа и класс':'Город и время',linked_story:'S-001',archive_file:'audit.svg',current_storage_path:'audit/'+(i===1?'portrait':i===2?'wide':'landscape')+'.svg',current_file_name:'audit.svg',quality_status:'готово',source_note:'Синтетические данные аудита',approx_date_text:'1983',location_text:'Тестовое место',data:{album_title:i<3?'Школьный альбом':'Город',reader_caption:'Тестовая подпись. Пропорции изображения должны сохраняться.',people:['10A-01'],thumbnail_storage_path:'audit/'+(i===1?'portrait':i===2?'wide':'landscape')+'.svg'},updated_at:'2026-10-12T09:00:00Z'}));
 const messages=Array.from({length:24},(_,i)=>({id:'M-'+String(24-i).padStart(3,'0'),room_id:'general',author_id:i%2?'audit-user':'audit-other',author:{display_name:'Тестовый собеседник',role:'member'},created_at:'2026-10-12T10:'+String(23-i).padStart(2,'0')+':00Z',body:i===0?'Последнее синтетическое сообщение. Проверьте, можно ли открыть меню и нажать его пункты.':i===23?'Первое сообщение. Меню у верхней границы не должно обрезаться.':'Тестовая беседа об уроках, прогулках и школьном фотоальбоме. Длинная ссылка: https://example.invalid/'+('archive-memory-'.repeat(i%3+1)),reply_to:null,is_evidence:false,attachments:i===4?[{id:'A-001',current_storage_path:'audit/portrait.svg',current_file_name:'audit.svg',caption:'Вертикальное фото для аудита',created_by:'audit-user',is_removed:false}]:[]}));
 window.auditRows={
  profiles:[{id:'audit-user',display_name:'Тестовый участник',role:'member',is_active:true,access_blocked:false,person_id:'10A-01',class_group:'10А'}],
  user_consents:[{user_id:'audit-user',accepted_at:'2026-10-08',withdrawn_at:null,consent_code:'archive_personal_data',consent_version:'2026-09-30-v3'}],
  archive_people:people,
  class_photos:['10А','10Б'].map((group,gi)=>({id:'CLASS-10'+(gi?'B':'A'),group_name:group,title:'Синтетическая общая фотография '+group,storage_path:'audit/class.svg',source_width:1600,source_height:900})),
  class_photo_regions:people.map((p,i)=>({class_photo_id:'CLASS-10'+(i<4?'A':'B'),person_id:p.id,x:150+(i%4)*350,y:270,w:180,h:250})),
  archive_stories:Array.from({length:4},(_,i)=>({id:'S-00'+(i+1),title:['Дорога после школьного звонка','Люди нашего класса','Прогулка по набережной','Музыка и школьные вечера'][i],period:'1983',kind:'воспоминание',full_chapter:['Школа и класс','Люди 78-й','Свобода за школьным порогом','Музыка, мода и свои правила'][i],data:{story_state:'готовая история',story_text:paragraphs,people:['10A-01'],media_ids:['P-001'],cover_media_id:'P-001'},updated_at:'2026-10-12T09:00:00Z'})),
  archive_media:[...photos,{id:'V-001',media_type:'video',title:'Тестовый исторический ролик',current_storage_path:null,data:{conversion_status:'ready',poster_storage_path:'audit/landscape.svg',duration_seconds:2,reader_caption:'Синтетическое видео'},created_at:'2026-10-12T09:00:00Z'}],
  city_essays:[{id:'C-001',title:'Улица, двор и Волга',theme:'город',period:'1983',excerpt:'Синтетический городской этюд для проверки изображений и чтения.',body:paragraphs,media_ids:['P-001'],source_status:'подтверждённая редакция',sort_order:1},{id:'C-002',title:'Музыка во дворе',theme:'культура',period:'1983',excerpt:'Тест музыкального блока',music_url:'https://music.yandex.ru/album/100000/track/100000',music_caption:'Тестовый музыкальный блок',body:paragraphs+'\n\nhttps://music.yandex.ru/album/100000/track/100000',media_ids:['P-002'],source_status:'подтверждённая редакция',sort_order:2}],
  city_essay_comments:[{id:'CC-001',essay_id:'C-001',user_id:'audit-user',body:'Тестовый комментарий: строка и кнопка ответа должны оставаться видимыми.',created_at:'2026-10-12T10:00:00Z',author:{display_name:'Тестовый участник'},profiles:{display_name:'Тестовый участник'}}],
  city_memory_details:[{id:'CD-001',title:'Школьный двор',detail_text:'Синтетическая исчезнувшая деталь',author_id:'audit-user',status:'published',category:'город'}],
  archive_questions:Array.from({length:3},(_,i)=>({id:'Q-00'+(i+1),question:'Как называлось это место возле школы? Тестовый вопрос '+(i+1),why_it_matters:'Синтетический вопрос для проверки карточки и обсуждения.',ask:'Предложите уточнение',category:'Город',priority:'P'+(i+1),status:'открыт',tags:['1983'],links:[],discussion_room:'general'})),
  editorial_questions:[],messages,reactions:[{message_id:'M-024',user_id:'audit-other',emoji:'👍'}],message_reads:[{message_id:'M-024',user_id:'audit-other',read_at:'2026-10-12T11:00:00Z'}],
  member_memories:[{user_id:'audit-user',school_dream:'Тестовая школьная мечта. '+paragraphs.slice(0,300),life_now:'Тестовое описание сегодняшней жизни. '+paragraphs.slice(0,300),then_photo:'audit/portrait.svg',now_photo:'audit/portrait.svg',updated_at:'2026-10-08T09:00:00Z'}]
 };
 const client=supabase.createClient();window.auditClient=client;window.auditRealtime=[];
 client.from=table=>{
  let filters=[],columns='*',single=false,limit=null,op='select',payload=null,orders=[];
  const match=row=>filters.every(([k,v,type])=>type==='eq'?row[k]===v:type==='neq'?row[k]!==v:type==='in'?v.includes(row[k]):type==='not-null'?row[k]!=null:true);
  const q=new Proxy({}, {get(_,key){
   if(key==='then')return resolve=>{
    auditCalls.push({table,op,columns,filters,payload});let rows=window.auditRows[table]||[];
    if(op==='insert'||op==='upsert'){
     const added=(Array.isArray(payload)?payload:[payload]).filter(Boolean).map(x=>({id:x.id||'AUDIT-'+Date.now(),created_at:'2026-10-13T10:00:00Z',updated_at:'2026-10-13T10:00:00Z',author:{display_name:'Тестовый участник'},...x}));
     window.auditRows[table]=rows=[...rows,...added];rows=added;
    }else if(op==='update'){rows.forEach(x=>{if(match(x))Object.assign(x,payload)});rows=rows.filter(match)}
    else if(op==='delete'){window.auditRows[table]=rows.filter(x=>!match(x));rows=[]}
    else rows=rows.filter(match);
    rows=rows.map(x=>({...x}));for(const [k,asc] of orders.reverse())rows.sort((a,b)=>String(a[k]||'').localeCompare(String(b[k]||''))*(asc?1:-1));
    const total=rows.length;if(limit!=null)rows=rows.slice(0,limit);
    if(columns&&!columns.includes('*')&&!columns.includes(':')&&!columns.includes('('))rows=rows.map(x=>Object.fromEntries(columns.split(',').map(k=>[k.trim(),x[k.trim()]])));
    resolve({data:single?(rows[0]||null):rows,count:total,error:null});
   };
   return (...args)=>{if(key==='select')columns=args[0]||'*';if(['eq','neq','in'].includes(key))filters.push([args[0],args[1],key]);if(key==='not'&&args[1]==='is'&&args[2]===null)filters.push([args[0],null,'not-null']);if(key==='order')orders.push([args[0],args[1]?.ascending!==false]);if(['maybeSingle','single'].includes(key))single=true;if(key==='limit')limit=args[0];if(['insert','upsert','update','delete'].includes(key)){op=key;payload=args[0]}return q};
  }});return q;
 };
 client.storage.from=()=>({createSignedUrl:async p=>({data:{signedUrl:location.origin+'/'+p},error:null}),createSignedUrls:async paths=>({data:paths.map(p=>({path:p,signedUrl:location.origin+'/'+p})),error:null}),upload:async p=>({data:{path:p},error:null}),remove:async()=>({error:null})});
 client.functions.invoke=async(name,args)=>{auditCalls.push({function:name,args});return {data:{ok:true,url:location.origin+'/audit/video.webm',items:[],text:'Синтетический ответ'},error:null}};
 client.channel=name=>{const c={name,on(type,filter,fn){auditRealtime.push({name,type,filter,fn,channel:c});return c},subscribe(){return c},unsubscribe(){}};return c};
 client.removeChannel=c=>{auditRealtime=auditRealtime.filter(x=>x.channel!==c)};
 supabase.createClient=()=>client;
};
