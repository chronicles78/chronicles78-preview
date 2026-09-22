import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.7/cors";

const PENDING_BUCKET = "archive-pending";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return response({ error: "server_configuration_error" }, 500);

  const authorization = req.headers.get("Authorization") || "";
  const jwt = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return response({ error: "authentication_required" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  const user = authData?.user;
  if (authError || !user) return response({ error: "invalid_session" }, 401);

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,is_active,display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile?.is_active) return response({ error: "inactive_profile" }, 403);

  let input: {
    submissionId?: string;
    originalPath?: string;
    previewPath?: string;
    fileName?: string;
    title?: string;
    description?: string | null;
    approxDate?: string | null;
    location?: string | null;
    peopleNote?: string | null;
    sourceNote?: string | null;
    permissionConfirmed?: boolean;
    originalFileSize?: number | null;
    sourceWidth?: number | null;
    sourceHeight?: number | null;
    previewWidth?: number | null;
    previewHeight?: number | null;
    previewFormat?: string | null;
  };
  try { input = await req.json(); }
  catch { return response({ error: "invalid_json" }, 400); }

  const submissionId=String(input.submissionId||"").trim();
  const originalPath=String(input.originalPath||"").trim();
  const previewPath=String(input.previewPath||"").trim();
  const fileName=String(input.fileName||"photo.jpg").trim();
  const title=String(input.title||"").trim();

  if(!submissionId||!originalPath||!previewPath||!title){
    return response({error:"required_fields_missing"},400);
  }
  if(input.permissionConfirmed!==true){
    return response({error:"permission_confirmation_required"},400);
  }
  if(!originalPath.startsWith(user.id+"/")){
    return response({error:"original_path_not_owned_by_user"},403);
  }
  if(!previewPath.startsWith(user.id+"/"+submissionId+"/")){
    return response({error:"preview_path_not_owned_by_submission"},403);
  }

  const {data:previewBlob,error:previewError}=await admin.storage
    .from(PENDING_BUCKET).download(previewPath);
  if(previewError||!previewBlob){
    return response({error:"preview_not_found",detail:previewError?.message},422);
  }

  const {data:existing}=await admin.from("photo_submissions")
    .select("id,status").eq("id",submissionId).maybeSingle();
  if(existing){
    return response({ok:true,submissionId,status:existing.status,alreadyExists:true});
  }

  const {error:insertError}=await admin.from("photo_submissions").insert({
    id:submissionId,
    submitted_by:user.id,
    title,
    description:String(input.description||"").trim()||null,
    approx_date_text:String(input.approxDate||"").trim()||null,
    location_text:String(input.location||"").trim()||null,
    people_note:String(input.peopleNote||"").trim()||null,
    source_note:String(input.sourceNote||"").trim()||null,
    permission_confirmed:true,
    original_storage_path:originalPath,
    preview_storage_path:previewPath,
    original_file_name:fileName,
    original_file_size:Number(input.originalFileSize)||null,
    source_width:Number(input.sourceWidth)||null,
    source_height:Number(input.sourceHeight)||null,
    preview_width:Number(input.previewWidth)||null,
    preview_height:Number(input.previewHeight)||null,
    preview_file_size:previewBlob.size,
    preview_format:String(input.previewFormat||"webp"),
    status:"pending",
  });
  if(insertError){
    return response({error:"submission_create_failed",detail:insertError.message},422);
  }

  const {data:moderators}=await admin.from("profiles")
    .select("id").eq("is_active",true).in("role",["editor","admin"]);
  if(moderators?.length){
    await admin.from("notifications").insert(moderators.map(m=>({
      user_id:m.id,
      kind:"photo_submission",
      title:"Новое фото на проверку",
      body:String(profile.display_name||"Участник")+": "+title,
      entity_type:"photo_submission",
      entity_id:submissionId,
    })));
  }

  return response({ok:true,submissionId,status:"pending"});
});
