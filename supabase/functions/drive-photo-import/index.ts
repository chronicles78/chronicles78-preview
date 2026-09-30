import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.7/cors";
import { ImageMagick, initializeImageMagick, MagickFormat } from "npm:@imagemagick/magick-wasm@0.0.43";

const wasmBytes=await Deno.readFile(new URL("magick.wasm",import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.43")));
await initializeImageMagick(wasmBytes);

const WORK_BUCKET="archive-media";
const FULL_MAX=1920, FULL_QUALITY=82, THUMB_MAX=560, THUMB_QUALITY=76;

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
 const j=await r.json(); if(!r.ok||!j?.access_token)throw new Error("google_token_refresh_failed");
 return String(j.access_token);
}
type DriveFile={id:string;name:string;size?:string;mimeType?:string;md5Checksum?:string;webViewLink?:string;createdTime?:string;modifiedTime?:string;parents?:string[];trashed?:boolean;imageMediaMetadata?:{width?:number;height?:number};folderId?:string;folderName?:string|null;folderPath?:string|null};\ntype DriveFolder={id:string;name:string;path:string;depth:number};
async function listDriveChildren(token:string,folderId:string){
 let pageToken="",out:DriveFile[]=[];
 do{
  const q="'"+folderId.replaceAll("'","\\\\'")+"' in parents and trashed = false";
  const u=new URL("https://www.googleapis.com/drive/v3/files");
  u.searchParams.set("q",q);u.searchParams.set("pageSize","1000");
  u.searchParams.set("fields","nextPageToken,files(id,name,size,mimeType,md5Checksum,webViewLink,createdTime,modifiedTime,parents,trashed,imageMediaMetadata(width,height))");
  if(pageToken)u.searchParams.set("pageToken",pageToken);
  const r=await fetch(u,{headers:{Authorization:"Bearer "+token}});const j=await r.json();
  if(!r.ok)throw new Error("google_drive_list_failed: "+JSON.stringify(j));
  out.push(...(j.files||[]));
  pageToken=String(j.nextPageToken||"");
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
async function downloadDriveFile(token:string,fileId:string){
 const r=await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(fileId)+"?alt=media",{headers:{Authorization:"Bearer "+token}});
 if(!r.ok)throw new Error("google_drive_download_failed: "+r.status);
 return new Uint8Array(await r.arrayBuffer());
}
function makeWebp(bytes:Uint8Array,maxSide:number,quality:number){
 let sourceWidth=0,sourceHeight=0,width=0,height=0;
 const data=ImageMagick.read(bytes,(img):Uint8Array=>{
  img.autoOrient();sourceWidth=img.width;sourceHeight=img.height;
  const longSide=Math.max(img.width,img.height);
  if(longSide>maxSide){const scale=maxSide/longSide;width=Math.max(1,Math.round(img.width*scale));height=Math.max(1,Math.round(img.height*scale));img.resize(width,height)}
  else{width=img.width;height=img.height}
  img.strip();img.quality=quality;
  return img.write(MagickFormat.WebP,(x)=>Uint8Array.from(x));
 });
 return {data,sourceWidth,sourceHeight,width,height};
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
 if(req.method!=="POST")return response({error:"method_not_allowed"},405);
 const supabaseUrl=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!supabaseUrl||!serviceKey)return response({error:"server_configuration_error"},500);
 const jwt=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!jwt)return response({error:"authentication_required"},401);
 const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authData,error:authError}=await admin.auth.getUser(jwt);const user=authData?.user;
 if(authError||!user)return response({error:"invalid_session"},401);
 const {data:profile}=await admin.from("profiles").select("role,is_active").eq("id",user.id).maybeSingle();
 if(!profile?.is_active||String(profile.role)!=="admin")return response({error:"admin_required"},403);

 let input:any={};try{input=await req.json()}catch{}
 const action=String(input.action||"scan");
 const {data:backend,error:be}=await admin.from("archive_storage_backends").select("enabled,originals_folder_id").eq("code","google_drive").maybeSingle();
 if(be||!backend?.enabled||!backend.originals_folder_id)return response({error:"google_drive_backend_unavailable"},503);
 let token="";try{token=await googleAccessToken()}catch(e){return response({error:"google_drive_auth_failed",detail:e instanceof Error?e.message:String(e)},503)}
 let files:DriveFile[],foldersScanned=0;try{const tree=await listDriveImages(token,backend.originals_folder_id);files=tree.files;foldersScanned=tree.foldersScanned}catch(e){return response({error:"google_drive_list_failed",detail:e instanceof Error?e.message:String(e)},502)}

 const {data:objects,error:oe}=await admin.from("archive_original_objects").select("media_id,external_file_id,file_name,file_size").not("external_file_id","is",null);
 if(oe)return response({error:"original_registry_query_failed",detail:oe.message},422);
 const registeredById=new Map((objects||[]).map((o:any)=>[String(o.external_file_id),o]));
 const driveById=new Map(files.map(f=>[f.id,f]));
 const registeredFiles=(objects||[]).map((o:any)=>driveById.get(String(o.external_file_id))).filter(Boolean) as DriveFile[];

 if(action==="scan"){
  const registered:any[]=[],duplicates:any[]=[],newFiles:any[]=[];
  for(const f of files){
   const reg=registeredById.get(f.id);
   if(reg){registered.push({id:f.id,name:f.name,size:Number(f.size||0),mediaId:(reg as any).media_id});continue}
   const dup=probableDuplicate(f,registeredFiles);
   const row={id:f.id,name:f.name,size:Number(f.size||0),mimeType:f.mimeType||null,md5Checksum:f.md5Checksum||null,createdTime:f.createdTime||null,modifiedTime:f.modifiedTime||null};
   if(dup){const dreg=registeredById.get(dup.id);duplicates.push({...row,duplicateOf:{driveFileId:dup.id,mediaId:(dreg as any)?.media_id||null,name:dup.name}})}
   else newFiles.push(row);
  }
  return response({ok:true,folderId:backend.originals_folder_id,folderUrl:"https://drive.google.com/drive/folders/"+backend.originals_folder_id,foldersScanned,total:files.length,registered:registered.length,newFiles,duplicates});
 }

 if(action!=="import")return response({error:"unknown_action"},400);
 const fileId=String(input.fileId||""),mediaId=String(input.mediaId||"").toUpperCase();
 if(!fileId||!/^MEDIA-\d{3,}$/.test(mediaId))return response({error:"file_id_and_media_id_required"},400);
 if(registeredById.has(fileId))return response({error:"already_registered",mediaId:(registeredById.get(fileId) as any)?.media_id},409);
 const file=driveById.get(fileId);
 if(!file)return response({error:"drive_file_not_found_in_originals_folder"},404);
 const dup=probableDuplicate(file,registeredFiles);
 if(dup&&!input.force){const dreg=registeredById.get(dup.id);return response({error:"probable_duplicate",duplicateOf:{driveFileId:dup.id,mediaId:(dreg as any)?.media_id||null,name:dup.name}},409)}
 const {data:existing}=await admin.from("archive_media").select("id").eq("id",mediaId).maybeSingle();
 if(existing)return response({error:"media_id_exists"},409);
 const size=Number(file.size||0);if(size>25*1024*1024)return response({error:"original_too_large",maxBytes:25*1024*1024},413);

 let inputBytes:Uint8Array;try{inputBytes=await downloadDriveFile(token,fileId)}catch(e){return response({error:"drive_download_failed",detail:e instanceof Error?e.message:String(e)},422)}
 let full,thumb;try{full=makeWebp(inputBytes,FULL_MAX,FULL_QUALITY);thumb=makeWebp(full.data,THUMB_MAX,THUMB_QUALITY)}catch(e){return response({error:"image_processing_failed",detail:e instanceof Error?e.message:String(e)},422)}
 const stamp=Date.now(),base=safeBaseName(file.name);
 const fullPath=mediaId+"/web-drive-"+stamp+"-"+base+".webp";
 const thumbPath=mediaId+"/thumb-drive-"+stamp+"-"+base+".webp";
 const {error:fu}=await admin.storage.from(WORK_BUCKET).upload(fullPath,full.data,{contentType:"image/webp",cacheControl:"31536000",upsert:false});
 if(fu)return response({error:"full_upload_failed",detail:fu.message},422);
 const {error:tu}=await admin.storage.from(WORK_BUCKET).upload(thumbPath,thumb.data,{contentType:"image/webp",cacheControl:"31536000",upsert:false});
 if(tu){await admin.storage.from(WORK_BUCKET).remove([fullPath]);return response({error:"thumb_upload_failed",detail:tu.message},422)}

 const now=new Date().toISOString();
 const preliminaryTopic=String(file.folderName||"").trim()||null;\n const baseData:any={identification_status:"требует описания",people:[],preliminary_topic:preliminaryTopic,preliminary_topic_source:preliminaryTopic?"google_drive_folder":null,drive_folder_id:file.folderId||backend.originals_folder_id,drive_folder_name:file.folderName||null,drive_folder_path:file.folderPath||null,original_storage_backend:"google_drive",original_drive_file_id:file.id,original_drive_url:file.webViewLink||null,original_file_name:file.name,original_file_size:size||inputBytes.byteLength,original_md5:file.md5Checksum||null,drive_created_at:file.createdTime||null,drive_modified_at:file.modifiedTime||null,source_width:full.sourceWidth,source_height:full.sourceHeight,optimized_format:"webp",optimized_max_side:FULL_MAX,optimized_quality:FULL_QUALITY,thumbnail_storage_path:thumbPath,thumbnail_width:thumb.width,thumbnail_height:thumb.height,thumbnail_file_size:thumb.data.byteLength,processing_status:"ready",processed_at:now};
 const {error:ie}=await admin.from("archive_media").insert({id:mediaId,title:titleFromName(file.name),category:"архивное фото",archive_file:file.name,linked_story:null,data:baseData,visibility:"members",quality_status:"оригинал",source_note:"Импортировано из Google Drive",provenance_type:"собственное документальное фото",attribution_confidence:"не проверено",publication_permission:"только внутренний архив"});
 if(ie){await admin.storage.from(WORK_BUCKET).remove([fullPath,thumbPath]);return response({error:"media_create_failed",detail:ie.message},422)}

 const userClient=createClient(supabaseUrl,Deno.env.get("SUPABASE_ANON_KEY")||serviceKey,{global:{headers:{Authorization:"Bearer "+jwt}},auth:{persistSession:false,autoRefreshToken:false}});
 const {error:ve}=await userClient.rpc("replace_archive_media_version",{p_media_id:mediaId,p_storage_path:fullPath,p_file_name:base+".webp",p_version_type:"копия",p_reason:"Импорт оригинала из Google Drive",p_source_note:"Google Drive",p_width:full.width,p_height:full.height,p_file_size:full.data.byteLength});
 if(ve){await admin.from("archive_media").delete().eq("id",mediaId);await admin.storage.from(WORK_BUCKET).remove([fullPath,thumbPath]);return response({error:"version_commit_failed",detail:ve.message},422)}

 const {data:committed}=await admin.from("archive_media").select("data").eq("id",mediaId).maybeSingle();
 const finalData={...(committed?.data||baseData),...baseData,original_history:[...((committed?.data as any)?.original_history||[]),{storage_backend:"google_drive",drive_file_id:file.id,drive_folder_id:file.folderId||backend.originals_folder_id,drive_folder_name:file.folderName||null,drive_folder_path:file.folderPath||null,preliminary_topic:preliminaryTopic,file_name:file.name,file_size:size||inputBytes.byteLength,md5:file.md5Checksum||null,working_path:fullPath,working_file_size:full.data.byteLength,thumbnail_path:thumbPath,thumbnail_file_size:thumb.data.byteLength,source_width:full.sourceWidth,source_height:full.sourceHeight,width:full.width,height:full.height,processed_at:now}].slice(-30)};
 await admin.from("archive_media").update({data:finalData,updated_at:now}).eq("id",mediaId);
 const {error:ooe}=await admin.from("archive_original_objects").insert({owner_user_id:user.id,media_id:mediaId,source_bucket:"google-drive",source_path:file.id,file_name:file.name,mime_type:file.mimeType||null,file_size:size||inputBytes.byteLength,storage_backend:"google_drive",external_provider:"google_drive",external_file_id:file.id,external_folder_id:file.folderId||backend.originals_folder_id,external_url:file.webViewLink||null,mirror_status:"mirrored",mirrored_at:now,source_deleted_at:now,updated_at:now});
 if(ooe){
  await admin.from("archive_media").delete().eq("id",mediaId);
  await admin.storage.from(WORK_BUCKET).remove([fullPath,thumbPath]);
  return response({error:"original_registry_failed",detail:ooe.message},422);
 }
 return response({ok:true,mediaId,fileId:file.id,fileName:file.name,folderId:file.folderId||backend.originals_folder_id,folderName:file.folderName||null,folderPath:file.folderPath||null,preliminaryTopic,fullPath,thumbPath,width:full.width,height:full.height,thumbnailWidth:thumb.width,thumbnailHeight:thumb.height});
});