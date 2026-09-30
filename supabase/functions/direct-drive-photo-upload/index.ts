import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.7/cors";

function response(body: unknown, status=200){
  return Response.json(body,{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
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
async function driveFile(token:string,id:string){
  const r=await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(id)+"?fields=id,name,size,mimeType,webViewLink,createdTime,trashed,parents,appProperties",{headers:{Authorization:"Bearer "+token}});
  const j=await r.json(); if(!r.ok)throw new Error("google_drive_verify_failed: "+JSON.stringify(j)); return j;
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return response({error:"method_not_allowed"},405);
  const supabaseUrl=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!supabaseUrl||!serviceKey)return response({error:"server_configuration_error"},500);
  const jwt=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!jwt)return response({error:"authentication_required"},401);
  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData}=await admin.auth.getUser(jwt); const user=authData?.user;
  if(!user)return response({error:"invalid_session"},401);
  const {data:profile}=await admin.from("profiles").select("role,is_active").eq("id",user.id).maybeSingle();
  if(!profile?.is_active||profile.role!=="admin")return response({error:"admin_required"},403);
  let input:any={}; try{input=await req.json()}catch{return response({error:"invalid_json"},400)}
  const action=String(input.action||"init");
  const {data:backend}=await admin.from("archive_storage_backends").select("*").eq("code","google_drive").maybeSingle();
  if(!backend?.enabled||!backend?.originals_folder_id)return response({error:"google_drive_backend_unavailable"},503);
  let token=""; try{token=await googleAccessToken()}catch(e){return response({error:"google_drive_auth_failed",detail:String(e)},503)}
  if(action==="init"){
    const mediaId=String(input.mediaId||"").trim(),fileName=String(input.fileName||"").trim(),mimeType=String(input.mimeType||"application/octet-stream"),fileSize=Number(input.fileSize||0);
    if(!/^MEDIA-\d{3,}$/i.test(mediaId)||!fileName||!fileSize)return response({error:"invalid_upload_metadata"},400);
    const {data:media}=await admin.from("archive_media").select("id").eq("id",mediaId).maybeSingle();
    if(!media)return response({error:"media_not_found"},404);
    const metadata={name:fileName,parents:[backend.originals_folder_id],description:"Хроники-78 · массовая прямая загрузка оригинала",appProperties:{chronicles78_media_id:mediaId,chronicles78_owner:user.id}};
    const r=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,mimeType,webViewLink,createdTime,parents,appProperties",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json; charset=UTF-8","X-Upload-Content-Type":mimeType,"X-Upload-Content-Length":String(fileSize)},body:JSON.stringify(metadata)});
    if(!r.ok)return response({error:"google_drive_session_failed",detail:await r.text()},502);
    const uploadUrl=r.headers.get("Location"); if(!uploadUrl)return response({error:"google_drive_session_url_missing"},502);
    return response({ok:true,uploadUrl,folderId:backend.originals_folder_id});
  }
  if(action==="finalize"){
    const mediaId=String(input.mediaId||"").trim(),fileId=String(input.fileId||"").trim(),fileName=String(input.fileName||"").trim(),mimeType=String(input.mimeType||"application/octet-stream"),fileSize=Number(input.fileSize||0);
    if(!mediaId||!fileId)return response({error:"media_id_and_file_id_required"},400);
    const file=await driveFile(token,fileId);
    if(file.trashed||!Array.isArray(file.parents)||!file.parents.includes(backend.originals_folder_id)||String(file.appProperties?.chronicles78_media_id||"")!==mediaId)return response({error:"google_drive_file_verification_failed"},409);
    if(fileSize&&Number(file.size)!==fileSize)return response({error:"google_drive_size_mismatch",expected:fileSize,actual:Number(file.size)},409);
    const now=new Date().toISOString();
    const sourcePath="drive://"+fileId;
    const {error:oe}=await admin.from("archive_original_objects").upsert({owner_user_id:user.id,media_id:mediaId,source_bucket:"google-drive",source_path:sourcePath,file_name:fileName||file.name,mime_type:mimeType||file.mimeType,file_size:Number(file.size)||fileSize,storage_backend:"google_drive",external_provider:"google_drive",external_file_id:fileId,external_folder_id:backend.originals_folder_id,external_url:file.webViewLink||null,mirror_status:"mirrored",mirrored_at:now,source_deleted_at:now,updated_at:now},{onConflict:"source_bucket,source_path"});
    if(oe)return response({error:"original_registry_failed",detail:oe.message},422);
    const {data:row}=await admin.from("archive_media").select("data").eq("id",mediaId).maybeSingle();
    const nextData={...(row?.data||{}),original_storage_backend:"google_drive",original_drive_file_id:fileId,original_drive_url:file.webViewLink||null,original_file_name:fileName||file.name,original_file_size:Number(file.size)||fileSize,original_registered_at:now};
    const {error:me}=await admin.from("archive_media").update({data:nextData,updated_at:now}).eq("id",mediaId);
    if(me)return response({error:"media_update_failed",detail:me.message},422);
    return response({ok:true,mediaId,fileId,webViewLink:file.webViewLink||null,size:Number(file.size)||fileSize});
  }
  return response({error:"unknown_action"},400);
});