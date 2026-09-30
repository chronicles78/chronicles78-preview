import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.7/cors";

const FOLDER_MIME="application/vnd.google-apps.folder";
const PLAYABLE_MIME=new Set(["video/mp4","video/webm"]);
const VIDEO_NAME="Видео";

type DriveFile={
 id:string;name:string;size?:string;mimeType?:string;md5Checksum?:string;webViewLink?:string;
 createdTime?:string;modifiedTime?:string;parents?:string[];trashed?:boolean;thumbnailLink?:string;
 videoMediaMetadata?:{width?:number;height?:number;durationMillis?:string};
 folderId?:string;folderName?:string|null;folderPath?:string|null
};
type DriveFolder={id:string;name:string;path:string;depth:number};

function json(body:unknown,status=200){return Response.json(body,{status,headers:{...corsHeaders,"Content-Type":"application/json; charset=utf-8"}})}
function titleFromName(name:string){return String(name||"Видео").replace(/\.[^.]+$/,"").replace(/[_-]+/g," ").replace(/\s+/g," ").trim()||"Видео"}
function safeSegment(name:string){return String(name||"video").replace(/[^a-zA-Z0-9._-]+/g,"_").replace(/^_+|_+$/g,"").slice(0,90)||"video"}
function b64url(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
async function hmac(secret:string,value:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64url(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value))))}
async function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0}

async function googleAccessToken(){
 const clientId=Deno.env.get("GOOGLE_DRIVE_CLIENT_ID"),clientSecret=Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET"),refreshToken=Deno.env.get("GOOGLE_DRIVE_REFRESH_TOKEN");
 if(!clientId||!clientSecret||!refreshToken)throw new Error("google_drive_oauth_not_configured");
 const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:"refresh_token"})});
 const j=await r.json();if(!r.ok||!j?.access_token)throw new Error("google_token_refresh_failed");
 return String(j.access_token);
}
async function googleTokenScope(token:string){
 try{
  const r=await fetch("https://www.googleapis.com/oauth2/v3/tokeninfo?access_token="+encodeURIComponent(token));
  const j=await r.json();return String(j?.scope||"");
 }catch{return ""}
}
async function listChildren(token:string,folderId:string){
 let pageToken="",out:DriveFile[]=[];
 do{
  const q="'"+folderId.replaceAll("'","\\'")+"' in parents and trashed = false";
  const u=new URL("https://www.googleapis.com/drive/v3/files");
  u.searchParams.set("q",q);u.searchParams.set("pageSize","1000");
  u.searchParams.set("fields","nextPageToken,files(id,name,size,mimeType,md5Checksum,webViewLink,createdTime,modifiedTime,parents,trashed,thumbnailLink,videoMediaMetadata(width,height,durationMillis))");
  if(pageToken)u.searchParams.set("pageToken",pageToken);
  const r=await fetch(u,{headers:{Authorization:"Bearer "+token}}),j=await r.json();
  if(!r.ok)throw new Error("google_drive_list_failed: "+JSON.stringify(j));
  out.push(...(j.files||[]));pageToken=String(j.nextPageToken||"");
 }while(pageToken);
 return out;
}
async function findOrCreateVideoFolder(token:string,admin:any,backend:any){
 const config={...(backend.config||{})};
 let folderId=String(config.video_folder_id||"").trim();
 if(folderId)return {folderId,folderUrl:"https://drive.google.com/drive/folders/"+folderId,created:false};
 const rootId=String(backend.root_folder_id||"").trim();
 if(!rootId)throw new Error("archive_root_folder_missing");
 const children=await listChildren(token,rootId);
 const hit=children.find(f=>String(f.mimeType||"")===FOLDER_MIME&&String(f.name||"").trim().toLowerCase()===VIDEO_NAME.toLowerCase());
 if(hit)folderId=hit.id;
 else{
  const r=await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({name:VIDEO_NAME,mimeType:FOLDER_MIME,parents:[rootId]})});
  const j=await r.json();
  if(!r.ok)throw new Error("video_folder_create_failed: "+JSON.stringify(j));
  folderId=String(j.id||"");
 }
 if(!folderId)throw new Error("video_folder_unavailable");
 config.video_folder_id=folderId;
 await admin.from("archive_storage_backends").update({config,updated_at:new Date().toISOString()}).eq("code","google_drive");
 return {folderId,folderUrl:"https://drive.google.com/drive/folders/"+folderId,created:!hit};
}
async function listVideos(token:string,rootFolderId:string){
 const queue:DriveFolder[]=[{id:rootFolderId,name:"",path:"",depth:0}],visited=new Set<string>(),files:DriveFile[]=[];let foldersScanned=0;
 while(queue.length){
  const folder=queue.shift()!;if(visited.has(folder.id))continue;visited.add(folder.id);foldersScanned++;
  if(foldersScanned>1000)throw new Error("google_drive_folder_limit_exceeded");
  const children=await listChildren(token,folder.id);
  for(const f of children){
   if(String(f.mimeType||"")===FOLDER_MIME){
    if(folder.depth>=12)continue;
    const childName=String(f.name||"").trim()||"Без названия";
    queue.push({id:f.id,name:childName,path:folder.path?folder.path+" / "+childName:childName,depth:folder.depth+1});
   }else if(String(f.mimeType||"").startsWith("video/")){
    files.push({...f,folderId:folder.id,folderName:folder.depth?folder.name:null,folderPath:folder.depth?folder.path:null});
   }
  }
 }
 return {files,foldersScanned};
}
function duplicateOf(file:DriveFile,registeredFiles:DriveFile[]){
 if(file.md5Checksum){const hit=registeredFiles.find(x=>x.id!==file.id&&x.md5Checksum&&x.md5Checksum===file.md5Checksum);if(hit)return hit}
 const size=Number(file.size||0);return registeredFiles.find(x=>x.id!==file.id&&x.name===file.name&&Number(x.size||0)===size)||null;
}
async function getAuthUser(admin:any,req:Request){
 const jwt=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();if(!jwt)return null;
 const {data,error}=await admin.auth.getUser(jwt);if(error||!data?.user)return null;
 return data.user;
}
async function requireActive(admin:any,user:any,adminOnly=false){
 if(!user)return false;
 const {data:p}=await admin.from("profiles").select("role,is_active,access_blocked").eq("id",user.id).maybeSingle();
 if(!p?.is_active||p?.access_blocked)return false;
 return adminOnly?String(p.role)==="admin":true;
}
async function importPoster(admin:any,token:string,file:DriveFile,mediaId:string){
 if(!file.thumbnailLink)return {path:null,error:null};
 try{
  const r=await fetch(file.thumbnailLink,{headers:{Authorization:"Bearer "+token}});if(!r.ok)return {path:null,error:"thumbnail_http_"+r.status};
  const bytes=new Uint8Array(await r.arrayBuffer());if(!bytes.length)return {path:null,error:"thumbnail_empty"};
  const ct=String(r.headers.get("content-type")||"image/jpeg").split(";")[0];
  const ext=ct.includes("png")?"png":ct.includes("webp")?"webp":"jpg";
  const path=mediaId+"/video-poster-"+Date.now()+"."+ext;
  const {error}=await admin.storage.from("archive-media").upload(path,bytes,{contentType:ct,cacheControl:"31536000",upsert:false});
  return error?{path:null,error:error.message}:{path,error:null};
 }catch(e){return {path:null,error:e instanceof Error?e.message:String(e)}}
}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 const supabaseUrl=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!supabaseUrl||!serviceKey)return json({error:"server_configuration_error"},500);
 const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

 if(req.method==="GET"){
  const u=new URL(req.url),mediaId=String(u.searchParams.get("media_id")||""),userId=String(u.searchParams.get("user_id")||""),exp=Number(u.searchParams.get("exp")||0),sig=String(u.searchParams.get("sig")||"");
  if(!mediaId||!userId||!exp||!sig||Date.now()>exp*1000)return new Response("Link expired",{status:401,headers:corsHeaders});
  const expected=await hmac(serviceKey,mediaId+"|"+userId+"|"+exp);if(!(await safeEqual(sig,expected)))return new Response("Invalid signature",{status:403,headers:corsHeaders});
  if(!(await requireActive(admin,{id:userId},false)))return new Response("Access denied",{status:403,headers:corsHeaders});
  const {data:m}=await admin.from("archive_media").select("media_type,data").eq("id",mediaId).maybeSingle();
  const driveId=String(m?.data?.original_drive_file_id||"");if(m?.media_type!=="video"||!driveId||m?.data?.conversion_status!=="ready")return new Response("Video not playable",{status:404,headers:corsHeaders});
  let token="";try{token=await googleAccessToken()}catch{return new Response("Drive unavailable",{status:503,headers:corsHeaders})}
  const headers:any={Authorization:"Bearer "+token};const range=req.headers.get("Range");if(range)headers.Range=range;
  const r=await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(driveId)+"?alt=media",{headers});
  const outHeaders=new Headers(corsHeaders);["content-type","content-length","content-range","accept-ranges","etag","last-modified"].forEach(h=>{const v=r.headers.get(h);if(v)outHeaders.set(h,v)});
  outHeaders.set("Cache-Control","private, no-store");outHeaders.set("Accept-Ranges","bytes");
  return new Response(r.body,{status:r.status,headers:outHeaders});
 }

 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 const user=await getAuthUser(admin,req);if(!user)return json({error:"authentication_required"},401);
 let input:any={};try{input=await req.json()}catch{}
 const action=String(input.action||"scan");
 if(action==="playback_url"){
  if(!(await requireActive(admin,user,false)))return json({error:"active_user_required"},403);
  const mediaId=String(input.mediaId||"");const {data:m}=await admin.from("archive_media").select("media_type,data").eq("id",mediaId).maybeSingle();
  if(m?.media_type!=="video")return json({error:"video_not_found"},404);
  if(m?.data?.conversion_status!=="ready")return json({error:"video_requires_conversion",mimeType:m?.data?.original_mime_type||null},409);
  const exp=Math.floor(Date.now()/1000)+15*60,sig=await hmac(serviceKey,mediaId+"|"+user.id+"|"+exp);
  return json({ok:true,url:supabaseUrl+"/functions/v1/drive-video-import?media_id="+encodeURIComponent(mediaId)+"&user_id="+encodeURIComponent(user.id)+"&exp="+exp+"&sig="+encodeURIComponent(sig),expiresAt:new Date(exp*1000).toISOString()});
 }
 if(!(await requireActive(admin,user,true)))return json({error:"admin_required"},403);
 const {data:backend,error:be}=await admin.from("archive_storage_backends").select("enabled,root_folder_id,config").eq("code","google_drive").maybeSingle();
 if(be||!backend?.enabled)return json({error:"google_drive_backend_unavailable"},503);
 let token="";try{token=await googleAccessToken()}catch(e){return json({error:"google_drive_auth_failed",detail:e instanceof Error?e.message:String(e)},503)}
 let vf:any;try{vf=await findOrCreateVideoFolder(token,admin,backend)}catch(e){return json({error:"video_folder_unavailable",detail:e instanceof Error?e.message:String(e),rootFolderUrl:backend.root_folder_id?"https://drive.google.com/drive/folders/"+backend.root_folder_id:null},422)}
 let tree:any;try{tree=await listVideos(token,vf.folderId)}catch(e){return json({error:"google_drive_list_failed",detail:e instanceof Error?e.message:String(e)},502)}
 const files:DriveFile[]=tree.files;
 const {data:objects,error:oe}=await admin.from("archive_original_objects").select("id,media_id,external_file_id,external_folder_id,file_name,file_size").not("external_file_id","is",null);if(oe)return json({error:"original_registry_query_failed",detail:oe.message},422);
 const registeredById=new Map((objects||[]).map((o:any)=>[String(o.external_file_id),o])),driveById=new Map(files.map(f=>[f.id,f]));
 const registeredFiles=(objects||[]).map((o:any)=>driveById.get(String(o.external_file_id))).filter(Boolean) as DriveFile[];

 if(action==="scan"){
  const registered:any[]=[],duplicates:any[]=[],newFiles:any[]=[];
  for(const f of files){
   const reg=registeredById.get(f.id);if(reg){registered.push({...f,mediaId:(reg as any).media_id});continue}
   const dup=duplicateOf(f,registeredFiles);if(dup){const dr=registeredById.get(dup.id);duplicates.push({...f,duplicateOf:{driveFileId:dup.id,mediaId:(dr as any)?.media_id||null,name:dup.name}})}else newFiles.push(f);
  }
  const oauthScope=files.length?null:await googleTokenScope(token);
  return json({ok:true,folderId:vf.folderId,folderUrl:vf.folderUrl,folderCreated:vf.created,foldersScanned:tree.foldersScanned,total:files.length,registered:registered.length,newFiles,duplicates,oauthScope,manualFilesMayBeHidden:!files.length&&!!oauthScope&&!oauthScope.split(/\\s+/).includes("https://www.googleapis.com/auth/drive")&&!oauthScope.split(/\\s+/).includes("https://www.googleapis.com/auth/drive.readonly")});
 }
 if(action!=="import")return json({error:"unknown_action"},400);
 const fileId=String(input.fileId||""),mediaId=String(input.mediaId||"").toUpperCase();
 if(!fileId||!/^MEDIA-\d{3,}$/.test(mediaId))return json({error:"file_id_and_media_id_required"},400);
 if(registeredById.has(fileId))return json({error:"already_registered",mediaId:(registeredById.get(fileId) as any)?.media_id},409);
 const file=driveById.get(fileId);if(!file)return json({error:"drive_video_not_found"},404);
 const dup=duplicateOf(file,registeredFiles);if(dup&&!input.force){const dr=registeredById.get(dup.id);return json({error:"probable_duplicate",duplicateOf:{driveFileId:dup.id,mediaId:(dr as any)?.media_id||null,name:dup.name}},409)}
 const {data:exists}=await admin.from("archive_media").select("id").eq("id",mediaId).maybeSingle();if(exists)return json({error:"media_id_exists"},409);
 const mime=String(file.mimeType||"application/octet-stream"),playable=PLAYABLE_MIME.has(mime),size=Number(file.size||0),now=new Date().toISOString();
 const preliminaryTopic=String(file.folderName||"").trim()||null,meta=file.videoMediaMetadata||{};
 const poster=await importPoster(admin,token,file,mediaId);
 const data:any={
  identification_status:"требует описания",people:[],media_type:"video",
  preliminary_topic:preliminaryTopic,preliminary_topic_source:preliminaryTopic?"google_drive_folder":null,
  drive_folder_id:file.folderId||vf.folderId,drive_folder_name:file.folderName||null,drive_folder_path:file.folderPath||null,
  original_storage_backend:"google_drive",original_drive_file_id:file.id,original_drive_url:file.webViewLink||null,
  original_file_name:file.name,original_file_size:size||null,original_mime_type:mime,original_md5:file.md5Checksum||null,
  drive_created_at:file.createdTime||null,drive_modified_at:file.modifiedTime||null,
  duration_ms:Number(meta.durationMillis||0)||null,source_width:Number(meta.width||0)||null,source_height:Number(meta.height||0)||null,
  poster_storage_path:poster.path,poster_error:poster.error,
  playback_mode:playable?"drive_stream":"none",conversion_status:playable?"ready":"needed",processing_status:"registered",processed_at:now
 };
 const {error:ie}=await admin.from("archive_media").insert({id:mediaId,media_type:"video",title:titleFromName(file.name),category:"архивное видео",archive_file:file.name,linked_story:null,data,visibility:"members",current_file_name:file.name,quality_status:"оригинал",source_note:"Импортировано из Google Drive",provenance_type:"собственное документальное видео",attribution_confidence:"не проверено",publication_permission:"только внутренний архив"});if(ie){if(poster.path)await admin.storage.from("archive-media").remove([poster.path]);return json({error:"media_create_failed",detail:ie.message},422)}
 const {error:ooe}=await admin.from("archive_original_objects").insert({owner_user_id:user.id,media_id:mediaId,source_bucket:"google-drive",source_path:file.id,file_name:file.name,mime_type:mime,file_size:size||null,storage_backend:"google_drive",external_provider:"google_drive",external_file_id:file.id,external_folder_id:file.folderId||vf.folderId,external_url:file.webViewLink||null,mirror_status:"mirrored",mirrored_at:now,updated_at:now});
 if(ooe){await admin.from("archive_media").delete().eq("id",mediaId);if(poster.path)await admin.storage.from("archive-media").remove([poster.path]);return json({error:"original_registry_failed",detail:ooe.message},422)}
 return json({ok:true,mediaId,fileId:file.id,fileName:file.name,folderName:file.folderName||null,folderPath:file.folderPath||null,preliminaryTopic,playable,conversionStatus:data.conversion_status,posterPath:poster.path,durationMs:data.duration_ms});
});
