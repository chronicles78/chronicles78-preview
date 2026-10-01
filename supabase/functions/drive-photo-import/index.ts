import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.7/cors";

const WORK_BUCKET="archive-media";
const FULL_MAX=1920,FULL_QUALITY=82,THUMB_MAX=560,THUMB_QUALITY=76;

function response(body:unknown,status=200){
 return Response.json(body,{status,headers:{...corsHeaders,"Content-Type":"application/json; charset=utf-8"}});
}
function safeBaseName(name:string){
 const b=String(name||"photo").replace(/\.[^.]+$/,"").replace(/[^a-zA-Z0-9._-]+/g,"_").replace(/^_+|_+$/g,"").slice(0,80);
 return b||"photo";
}
function titleFromName(name:string){
 return String(name||"Фотография").replace(/\.[^.]+$/,"").replace(/[_-]+/g," ").replace(/\s+/g," ").trim()||"Фотография";
}
async function googleAccessToken(){
 const clientId=Deno.env.get("GOOGLE_DRIVE_CLIENT_ID");
 const clientSecret=Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET");
 const refreshToken=Deno.env.get("GOOGLE_DRIVE_REFRESH_TOKEN");
 if(!clientId||!clientSecret||!refreshToken)throw new Error("google_drive_oauth_not_configured");
 const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:"refresh_token"})});
 const j=await r.json();
 if(!r.ok||!j?.access_token)throw new Error("google_token_refresh_failed");
 return String(j.access_token);
}
type DriveFile={id:string;name:string;size?:string;mimeType?:string;md5Checksum?:string;webViewLink?:string;createdTime?:string;modifiedTime?:string;parents?:string[];trashed?:boolean;imageMediaMetadata?:{width?:number;height?:number};folderId?:string;folderName?:string|null;folderPath?:string|null};
type DriveFolder={id:string;name:string;path:string;depth:number};

async function listDriveChildren(token:string,folderId:string){
 let pageToken="",out:DriveFile[]=[];
 do{
  const q="'"+folderId.replaceAll("'","\\\\'")+"' in parents and trashed = false";
  const u=new URL("https://www.googleapis.com/drive/v3/files");
  u.searchParams.set("q",q);u.searchParams.set("pageSize","1000");
  u.searchParams.set("fields","nextPageToken,files(id,name,size,mimeType,md5Checksum,webViewLink,createdTime,modifiedTime,parents,trashed,imageMediaMetadata(width,height))");
  if(pageToken)u.searchParams.set("pageToken",pageToken);
  const r=await fetch(u,{headers:{Authorization:"Bearer "+token}});
  const j=await r.json();
  if(!r.ok)throw new Error("google_drive_list_failed: "+JSON.stringify(j));
  out.push(...(j.files||[]));pageToken=String(j.nextPageToken||"");
 }while(pageToken);
 return out;
}
async function listDriveImages(token:string,rootFolderId:string){
 const FOLDER_MIME="application/vnd.google-apps.folder";
 const queue:DriveFolder[]=[{id:rootFolderId,name:"",path:"",depth:0}],visited=new Set<string>(),out:DriveFile[]=[];
 let foldersScanned=0;
 while(queue.length){
  const folder=queue.shift()!;
  if(visited.has(folder.id))continue;
  visited.add(folder.id);foldersScanned++;
  if(foldersScanned>1000)throw new Error("google_drive_folder_limit_exceeded");
  const children=await listDriveChildren(token,folder.id);
  for(const f of children){
   if(String(f.mimeType||"")===FOLDER_MIME){
    if(folder.depth>=12)continue;
    const childName=String(f.name||"").trim()||"Без названия";
    const childPath=folder.path?folder.path+" / "+childName:childName;
    queue.push({id:f.id,name:childName,path:childPath,depth:folder.depth+1});
    continue;
   }
   if(!String(f.mimeType||"").startsWith("image/"))continue;
   out.push({...f,folderId:folder.id,folderName:folder.depth?folder.name:null,folderPath:folder.depth?folder.path:null});
  }
 }
 return {files:out,foldersScanned};
}
async function getDriveFile(token:string,fileId:string){
 const u=new URL("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(fileId));
 u.searchParams.set("fields","id,name,size,mimeType,md5Checksum,webViewLink,createdTime,modifiedTime,parents,trashed,imageMediaMetadata(width,height)");
 const r=await fetch(u,{headers:{Authorization:"Bearer "+token}});
 const j=await r.json();
 if(!r.ok)throw new Error("google_drive_file_failed: "+JSON.stringify(j));
 return j as DriveFile;
}
async function folderMetaToRoot(token:string,parentId:string|undefined,rootId:string){
 if(!parentId)return null;
 if(parentId===rootId)return {folderId:rootId,folderName:null,folderPath:null};
 const leafId=parentId,names:string[]=[];
 let current=parentId;
 for(let depth=0;depth<12;depth++){
  const u=new URL("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(current));
  u.searchParams.set("fields","id,name,mimeType,parents,trashed");
  const r=await fetch(u,{headers:{Authorization:"Bearer "+token}});
  const j=await r.json();
  if(!r.ok||j?.trashed)return null;
  names.unshift(String(j.name||"Без названия"));
  const parents:Array<string>=j.parents||[];
  if(parents.includes(rootId))return {folderId:leafId,folderName:names[names.length-1]||null,folderPath:names.join(" / ")};
  current=String(parents[0]||"");
  if(!current)return null;
 }
 return null;
}
function probableDuplicate(file:DriveFile,registeredFiles:DriveFile[]){
 if(file.md5Checksum){
  const hit=registeredFiles.find(x=>x.id!==file.id&&x.md5Checksum&&x.md5Checksum===file.md5Checksum);
  if(hit)return hit;
 }
 const size=Number(file.size||0);
 return registeredFiles.find(x=>x.id!==file.id&&String(x.name||"")===String(file.name||"")&&Number(x.size||0)===size)||null;
}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(!["GET","POST"].includes(req.method))return response({error:"method_not_allowed"},405);
 const supabaseUrl=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!supabaseUrl||!serviceKey)return response({error:"server_configuration_error"},500);
 const jwt=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!jwt)return response({error:"authentication_required"},401);
 const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authData,error:authError}=await admin.auth.getUser(jwt);const user=authData?.user;
 if(authError||!user)return response({error:"invalid_session"},401);
 const {data:profile}=await admin.from("profiles").select("role,is_active").eq("id",user.id).maybeSingle();
 if(!profile?.is_active||String(profile.role)!=="admin")return response({error:"admin_required"},403);
 const {data:backend,error:be}=await admin.from("archive_storage_backends").select("enabled,originals_folder_id").eq("code","google_drive").maybeSingle();
 if(be||!backend?.enabled||!backend.originals_folder_id)return response({error:"google_drive_backend_unavailable"},503);
 let token="";try{token=await googleAccessToken()}catch(e){return response({error:"google_drive_auth_failed",detail:e instanceof Error?e.message:String(e)},503)}

 if(req.method==="GET"){
  const u=new URL(req.url),fileId=String(u.searchParams.get("fileId")||"");
  if(!fileId)return response({error:"file_id_required"},400);
  let meta:DriveFile;
  try{meta=await getDriveFile(token,fileId)}catch(e){return response({error:"drive_file_lookup_failed",detail:e instanceof Error?e.message:String(e)},404)}
  if(meta.trashed||!String(meta.mimeType||"").startsWith("image/"))return response({error:"drive_image_not_found"},404);
  const folder=await folderMetaToRoot(token,meta.parents?.[0],backend.originals_folder_id);
  if(!folder)return response({error:"drive_file_outside_originals_folder"},403);
  const drive=await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(fileId)+"?alt=media",{headers:{Authorization:"Bearer "+token}});
  if(!drive.ok)return response({error:"drive_download_failed",detail:String(drive.status)},422);
  const headers=new Headers(corsHeaders);
  headers.set("Content-Type",String(meta.mimeType||drive.headers.get("Content-Type")||"application/octet-stream"));
  const len=drive.headers.get("Content-Length");if(len)headers.set("Content-Length",len);
  headers.set("Cache-Control","no-store");
  return new Response(drive.body,{status:200,headers});
 }

 let input:any={};try{input=await req.json()}catch{}
 const action=String(input.action||"scan");

 if(action==="scan"){
  let files:DriveFile[],foldersScanned=0;
  try{const tree=await listDriveImages(token,backend.originals_folder_id);files=tree.files;foldersScanned=tree.foldersScanned}
  catch(e){return response({error:"google_drive_list_failed",detail:e instanceof Error?e.message:String(e)},502)}
  const {data:objects,error:oe}=await admin.from("archive_original_objects").select("id,media_id,external_file_id,external_folder_id,file_name,file_size").not("external_file_id","is",null);
  if(oe)return response({error:"original_registry_query_failed",detail:oe.message},422);
  const registeredById=new Map((objects||[]).map((o:any)=>[String(o.external_file_id),o]));
  const driveById=new Map(files.map(f=>[f.id,f]));
  const registeredFiles=(objects||[]).map((o:any)=>driveById.get(String(o.external_file_id))).filter(Boolean) as DriveFile[];

  const moved=(objects||[]).map((o:any)=>({object:o,file:driveById.get(String(o.external_file_id))})).filter((x:any)=>x.file&&String(x.object.external_folder_id||"")!==String(x.file.folderId||backend.originals_folder_id));
  if(moved.length){
   const mediaIds=[...new Set(moved.map((x:any)=>x.object.media_id).filter(Boolean))];
   const {data:mediaRows}=mediaIds.length?await admin.from("archive_media").select("id,data").in("id",mediaIds):{data:[]};
   const mediaMap=new Map((mediaRows||[]).map((m:any)=>[m.id,m]));
   await Promise.all(moved.map(async({object,file}:any)=>{
    const folderId=file.folderId||backend.originals_folder_id,folderName=file.folderName||null,folderPath=file.folderPath||null;
    await admin.from("archive_original_objects").update({external_folder_id:folderId,updated_at:new Date().toISOString()}).eq("id",object.id);
    if(!object.media_id)return;
    const row:any=mediaMap.get(object.media_id);if(!row)return;
    const d:any={...(row.data||{})};
    const autoTopic=d.preliminary_topic_source==="google_drive_folder"||(!d.preliminary_topic_source&&d.original_storage_backend==="google_drive");
    d.drive_folder_id=folderId;d.drive_folder_name=folderName;d.drive_folder_path=folderPath;
    if(autoTopic){d.preliminary_topic=folderName;d.preliminary_topic_source=folderName?"google_drive_folder":null}
    await admin.from("archive_media").update({data:d,updated_at:new Date().toISOString()}).eq("id",object.media_id);
   }));
  }

  const registered:any[]=[],duplicates:any[]=[],newFiles:any[]=[];
  for(const f of files){
   const reg=registeredById.get(f.id);
   if(reg){registered.push({id:f.id,name:f.name,size:Number(f.size||0),mediaId:(reg as any).media_id});continue}
   const dup=probableDuplicate(f,registeredFiles);
   const row={id:f.id,name:f.name,size:Number(f.size||0),mimeType:f.mimeType||null,md5Checksum:f.md5Checksum||null,createdTime:f.createdTime||null,modifiedTime:f.modifiedTime||null,folderId:f.folderId||backend.originals_folder_id,folderName:f.folderName||null,folderPath:f.folderPath||null};
   if(dup){const dreg=registeredById.get(dup.id);duplicates.push({...row,duplicateOf:{driveFileId:dup.id,mediaId:(dreg as any)?.media_id||null,name:dup.name}})}
   else newFiles.push(row);
  }
  return response({ok:true,folderId:backend.originals_folder_id,folderUrl:"https://drive.google.com/drive/folders/"+backend.originals_folder_id,foldersScanned,movedUpdated:moved.length,total:files.length,registered:registered.length,newFiles,duplicates});
 }

 if(action!=="register_client_processed")return response({error:"client_processing_required"},409);
 const fileId=String(input.fileId||""),mediaId=String(input.mediaId||"").toUpperCase();
 const fullPath=String(input.fullPath||""),thumbPath=String(input.thumbPath||"");
 if(!fileId||!/^MEDIA-\d{3,}$/.test(mediaId))return response({error:"file_id_and_media_id_required"},400);
 if(!fullPath.startsWith(mediaId+"/")||!thumbPath.startsWith(mediaId+"/"))return response({error:"invalid_storage_paths"},400);

 const {data:already}=await admin.from("archive_original_objects").select("media_id").eq("external_file_id",fileId).maybeSingle();
 if(already)return response({error:"already_registered",mediaId:already.media_id},409);
 const {data:existing}=await admin.from("archive_media").select("id").eq("id",mediaId).maybeSingle();
 if(existing)return response({error:"media_id_exists"},409);

 let file:DriveFile;
 try{file=await getDriveFile(token,fileId)}catch(e){return response({error:"drive_file_lookup_failed",detail:e instanceof Error?e.message:String(e)},404)}
 if(file.trashed||!String(file.mimeType||"").startsWith("image/"))return response({error:"drive_image_not_found"},404);
 const folder=await folderMetaToRoot(token,file.parents?.[0],backend.originals_folder_id);
 if(!folder)return response({error:"drive_file_outside_originals_folder"},403);
 const size=Number(file.size||0);if(size>25*1024*1024)return response({error:"original_too_large",maxBytes:25*1024*1024},413);

 const fullWidth=Math.max(1,Number(input.fullWidth)||0),fullHeight=Math.max(1,Number(input.fullHeight)||0),fullSize=Math.max(1,Number(input.fullSize)||0);
 const thumbWidth=Math.max(1,Number(input.thumbWidth)||0),thumbHeight=Math.max(1,Number(input.thumbHeight)||0),thumbSize=Math.max(1,Number(input.thumbSize)||0);
 const sourceWidth=Math.max(1,Number(input.sourceWidth)||Number(file.imageMediaMetadata?.width)||fullWidth);
 const sourceHeight=Math.max(1,Number(input.sourceHeight)||Number(file.imageMediaMetadata?.height)||fullHeight);
 const format=String(input.format||"webp").toLowerCase()==="jpg"?"jpg":"webp";
 if(!fullWidth||!fullHeight||!fullSize||!thumbWidth||!thumbHeight||!thumbSize)return response({error:"processed_image_metadata_required"},400);

 const list=await admin.storage.from(WORK_BUCKET).list(mediaId,{limit:100});
 if(list.error)return response({error:"processed_files_check_failed",detail:list.error.message},422);
 const names=new Set((list.data||[]).map((x:any)=>x.name));
 if(!names.has(fullPath.split("/").pop())||!names.has(thumbPath.split("/").pop()))return response({error:"processed_files_missing"},422);

 const now=new Date().toISOString(),preliminaryTopic=folder.folderName||null,base=safeBaseName(file.name);
 const baseData:any={identification_status:"требует описания",people:[],preliminary_topic:preliminaryTopic,preliminary_topic_source:preliminaryTopic?"google_drive_folder":null,drive_folder_id:folder.folderId,drive_folder_name:folder.folderName,drive_folder_path:folder.folderPath,original_storage_backend:"google_drive",original_drive_file_id:file.id,original_drive_url:file.webViewLink||null,original_file_name:file.name,original_file_size:size,original_md5:file.md5Checksum||null,drive_created_at:file.createdTime||null,drive_modified_at:file.modifiedTime||null,source_width:sourceWidth,source_height:sourceHeight,optimized_format:format,optimized_max_side:FULL_MAX,optimized_quality:FULL_QUALITY,thumbnail_storage_path:thumbPath,thumbnail_width:thumbWidth,thumbnail_height:thumbHeight,thumbnail_file_size:thumbSize,processing_status:"ready",processing_engine:"browser_canvas",processed_at:now};
 const {error:ie}=await admin.from("archive_media").insert({id:mediaId,title:titleFromName(file.name),category:"архивное фото",archive_file:file.name,linked_story:null,data:baseData,visibility:"members",quality_status:"оригинал",source_note:"Импортировано из Google Drive",provenance_type:"собственное документальное фото",attribution_confidence:"не проверено",publication_permission:"только внутренний архив"});
 if(ie)return response({error:"media_create_failed",detail:ie.message},422);

 const userClient=createClient(supabaseUrl,Deno.env.get("SUPABASE_ANON_KEY")||serviceKey,{global:{headers:{Authorization:"Bearer "+jwt}},auth:{persistSession:false,autoRefreshToken:false}});
 const {error:ve}=await userClient.rpc("replace_archive_media_version",{p_media_id:mediaId,p_storage_path:fullPath,p_file_name:base+"."+format,p_version_type:"копия",p_reason:"Импорт оригинала из Google Drive",p_source_note:"Google Drive",p_width:fullWidth,p_height:fullHeight,p_file_size:fullSize});
 if(ve){await admin.from("archive_media").delete().eq("id",mediaId);return response({error:"version_commit_failed",detail:ve.message},422)}

 const {data:committed}=await admin.from("archive_media").select("data").eq("id",mediaId).maybeSingle();
 const finalData={...(committed?.data||baseData),...baseData,original_history:[...((committed?.data as any)?.original_history||[]),{storage_backend:"google_drive",drive_file_id:file.id,drive_folder_id:folder.folderId,drive_folder_name:folder.folderName,drive_folder_path:folder.folderPath,preliminary_topic:preliminaryTopic,file_name:file.name,file_size:size,md5:file.md5Checksum||null,working_path:fullPath,working_file_size:fullSize,thumbnail_path:thumbPath,thumbnail_file_size:thumbSize,source_width:sourceWidth,source_height:sourceHeight,width:fullWidth,height:fullHeight,processed_at:now}].slice(-30)};
 await admin.from("archive_media").update({data:finalData,updated_at:now}).eq("id",mediaId);
 const {error:ooe}=await admin.from("archive_original_objects").insert({owner_user_id:user.id,media_id:mediaId,source_bucket:"google-drive",source_path:file.id,file_name:file.name,mime_type:file.mimeType||null,file_size:size,storage_backend:"google_drive",external_provider:"google_drive",external_file_id:file.id,external_folder_id:folder.folderId,external_url:file.webViewLink||null,mirror_status:"mirrored",mirrored_at:now,source_deleted_at:now,updated_at:now});
 if(ooe){
  await admin.from("archive_media").delete().eq("id",mediaId);
  return response({error:"original_registry_failed",detail:ooe.message},422);
 }
 return response({ok:true,mediaId,fileId:file.id,fileName:file.name,folderId:folder.folderId,folderName:folder.folderName,folderPath:folder.folderPath,preliminaryTopic,fullPath,thumbPath,width:fullWidth,height:fullHeight,thumbnailWidth:thumbWidth,thumbnailHeight:thumbHeight});
});
