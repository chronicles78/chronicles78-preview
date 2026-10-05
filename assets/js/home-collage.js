let homeCollageTimer=null,homeCollagePools=null,homeCollageOffset=0,homeCollageLoad=null;
function stopHomeCollage(){
 clearInterval(homeCollageTimer);homeCollageTimer=null;
 homeCollagePools=null;homeCollageOffset=0;
}
function homeCollageSelection(pools,offset){
 const cards=[];
 for(let i=0;i<6;i++){
  const group=i%2?"10Б":"10А",pool=pools[group]||[];
  const other=pools[group==="10А"?"10Б":"10А"]||[];
  const source=pool.length?pool:other;
  if(source.length)cards.push(source[(offset+Math.floor(i/2))%source.length]);
 }
 return cards;
}
function renderHomeCollage(){
 const box=$("homeClassPhotoLive");
 if(!box||!homeCollagePools||!user||!profile?.is_active)return;
 const cards=homeCollageSelection(homeCollagePools,homeCollageOffset);
 box.hidden=!cards.length;
 box.innerHTML=cards.map(({person,photo,region,url},i)=>
  '<button class="homeCollagePortrait collageSlot'+i+'" type="button" data-collage-person="'+esc(person.id)+'" data-collage-group="'+esc(person.group_name)+'" title="'+esc(personDisplayName(person)+' · '+person.group_name)+'">'+
  cropImageHtml(url,photo,region,"homeCollageFace",4/5,0,0,"",personDisplayName(person))+
  '<span>'+esc(personDisplayName(person))+'</span><small>'+esc(person.group_name)+'</small></button>'
 ).join("");
 box.querySelectorAll("[data-collage-person]").forEach(btn=>btn.onclick=async()=>{
  peopleGroup=btn.dataset.collageGroup;selectedPersonId=btn.dataset.collagePerson;
  document.querySelectorAll("[data-pgroup]").forEach(b=>b.classList.toggle("on",b.dataset.pgroup===peopleGroup));
  await showView("people");
  if(typeof openPersonContext==="function")await openPersonContext(selectedPersonId);
 });
}
async function loadHomeCollage(){
 if(!user||!profile?.is_active)return;
 if(homeCollageLoad)return homeCollageLoad;
 const owner=user.id;
 homeCollageLoad=(async()=>{
  const [photos,regions,people]=await Promise.all([
   sb.from("class_photos").select("id,group_name,storage_path,source_width,source_height").in("group_name",["10А","10Б"]),
   sb.from("class_photo_regions").select("class_photo_id,person_id,x,y,w,h").in("class_photo_id",["CLASS-10A","CLASS-10B"]),
   sb.from("archive_people").select("id,group_name,number,canonical_name,identification_status").in("group_name",["10А","10Б"]).order("number")
  ]);
  for(const res of [photos,regions,people])if(res.error)throw new Error(res.error.message);
  const photoMap=new Map((photos.data||[]).map(p=>[p.id,p]));
  const urls=new Map(await Promise.all((photos.data||[]).filter(p=>p.storage_path).map(async p=>[p.id,await archiveSignedImage(p.storage_path)])));
  const peopleMap=new Map((people.data||[]).map(p=>[p.id,p]));
  const pools={"10А":[],"10Б":[]};
  for(const region of regions.data||[]){
   const person=peopleMap.get(region.person_id),photo=photoMap.get(region.class_photo_id),url=urls.get(region.class_photo_id);
   if(person&&photo&&url&&cropRectFor(region,photo,4/5))pools[person.group_name]?.push({person,photo,region,url});
  }
  Object.values(pools).forEach(pool=>pool.sort((a,b)=>Number(a.person.number)-Number(b.person.number)));
  if(user?.id!==owner||!profile?.is_active)return;
  homeCollagePools=pools;renderHomeCollage();
  if(!homeCollageTimer)homeCollageTimer=setInterval(()=>{
   const box=$("homeClassPhotoLive");
   if(document.hidden||activeViewId()!=="home"||box?.matches(":hover")||box?.contains(document.activeElement))return;
   homeCollageOffset+=3;renderHomeCollage();
  },12000);
 })().catch(e=>{
  console.warn("Home collage load failed",e);
  const box=$("homeClassPhotoLive");if(box){box.hidden=true;box.replaceChildren()}
 }).finally(()=>{homeCollageLoad=null});
 return homeCollageLoad;
}
document.addEventListener("visibilitychange",()=>{
 if(!document.hidden&&activeViewId()==="home"&&user&&profile?.is_active)void loadHomeCollage();
});
