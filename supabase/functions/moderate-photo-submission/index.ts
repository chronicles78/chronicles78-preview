import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.7/cors";

const PENDING_BUCKET = "archive-pending";
const WORK_BUCKET = "archive-media";
const SOURCE_BUCKET = "archive-originals";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeBaseName(name: string) {
  const base = String(name || "photo")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return base || "photo";
}

function nextMediaId(ids: { id: string }[]) {
  const nums = ids
    .map((x) => Number(String(x.id).match(/^MEDIA-(\d+)$/)?.[1] || 0))
    .filter((x) => Number.isFinite(x));
  return "MEDIA-" + String(Math.max(0, ...nums) + 1).padStart(3, "0");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return response({ error: "server_configuration_error" }, 500);
  }

  const authorization = req.headers.get("Authorization") || "";
  const jwt = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return response({ error: "authentication_required" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  const user = authData?.user;
  if (authError || !user) return response({ error: "invalid_session" }, 401);

  const { data: profile } = await admin
    .from("profiles")
    .select("role,is_active,display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (
    !profile?.is_active ||
    !["editor", "admin"].includes(String(profile.role))
  ) {
    return response({ error: "not_allowed" }, 403);
  }

  let input: { submissionId?: string; decision?: "approve" | "reject"; note?: string };
  try {
    input = await req.json();
  } catch {
    return response({ error: "invalid_json" }, 400);
  }

  const submissionId = String(input.submissionId || "").trim();
  const decision = input.decision;
  const note = String(input.note || "").trim() || null;
  if (!submissionId || !["approve", "reject"].includes(String(decision))) {
    return response({ error: "bad_request" }, 400);
  }

  const { data: s, error: se } = await admin
    .from("photo_submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle();
  if (se || !s) return response({ error: "submission_not_found" }, 404);
  if (s.status !== "pending") {
    return response({ error: "submission_already_reviewed" }, 409);
  }

  const notifySubmitter = async (title: string, body: string) => {
    await admin.from("notifications").insert({
      user_id: s.submitted_by,
      kind: "photo_submission",
      title,
      body,
      entity_type: "photo_submission",
      entity_id: submissionId,
    });
  };

  if (decision === "reject") {
    const { data: updated, error } = await admin
      .from("photo_submissions")
      .update({
        status: "rejected",
        moderator_note: note,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", submissionId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) return response({ error: "reject_failed", detail: error.message }, 422);
    if (!updated) return response({ error: "submission_already_reviewed" }, 409);

    await admin.storage.from(PENDING_BUCKET).remove([s.preview_storage_path]);
    await admin.storage.from(SOURCE_BUCKET).remove([s.original_storage_path]);
    await admin.from("archive_original_objects")
      .update({
        mirror_status:"discarded",
        source_deleted_at:new Date().toISOString(),
        updated_at:new Date().toISOString(),
      })
      .eq("source_bucket",SOURCE_BUCKET)
      .eq("source_path",s.original_storage_path);
    await notifySubmitter(
      "Фото не принято в архив",
      note || "Редакция завершила проверку фотографии.",
    );
    return response({ ok: true, decision: "reject", submissionId });
  }

  const { data: previewBlob, error: pe } = await admin.storage
    .from(PENDING_BUCKET)
    .download(s.preview_storage_path);
  if (pe || !previewBlob) {
    return response({ error: "preview_download_failed", detail: pe?.message }, 422);
  }
  const previewBytes = new Uint8Array(await previewBlob.arrayBuffer());
  const previewExt = /^jpe?g$/i.test(String(s.preview_format || "")) ? "jpg" : "webp";
  const previewMime = previewExt === "jpg" ? "image/jpeg" : "image/webp";

  const { data: submitter } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", s.submitted_by)
    .maybeSingle();
  const submitterName = submitter?.display_name || "Участник";

  let mediaId = "";
  let workingPath = "";
  let mediaInserted = false;

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: ids } = await admin.from("archive_media").select("id");
    mediaId = nextMediaId(ids || []);
    workingPath =
      mediaId + "/web-submission-" + Date.now() + "-" + safeBaseName(s.original_file_name) + "." + previewExt;

    const { error: ue } = await admin.storage.from(WORK_BUCKET).upload(
      workingPath,
      previewBytes,
      {
        contentType: previewMime,
        cacheControl: "31536000",
        upsert: false,
      },
    );
    if (ue) return response({ error: "archive_upload_failed", detail: ue.message }, 422);

    const now = new Date().toISOString();
    const sourceNote =
      s.source_note || "Предоставил(а): " + String(submitterName);
    const archiveData = {
      identification_status: "требует описания",
      people: [],
      submitted_via: "photo_submission",
      photo_submission_id: submissionId,
      submitted_by: s.submitted_by,
      submitter_note: s.description || null,
      people_note: s.people_note || null,
      original_storage_path: s.original_storage_path,
      original_file_name: s.original_file_name,
      original_file_size: s.original_file_size,
      source_width: s.source_width,
      source_height: s.source_height,
      optimized_format: previewExt,
      optimized_max_side: 1920,
      optimized_quality: 82,
      processing_status: "approved",
      processed_at: now,
      original_history: [{
        storage_path: s.original_storage_path,
        file_name: s.original_file_name,
        file_size: s.original_file_size,
        source_width: s.source_width,
        source_height: s.source_height,
        working_path: workingPath,
        working_file_size: s.preview_file_size,
        width: s.preview_width,
        height: s.preview_height,
        processed_at: now,
        source: "photo_submission",
      }],
    };

    const { error: ie } = await admin.from("archive_media").insert({
      id: mediaId,
      title: s.title,
      category: "архивное фото",
      archive_file: s.original_file_name,
      data: archiveData,
      visibility: "members",
      current_storage_path: workingPath,
      current_file_name: safeBaseName(s.original_file_name) + "." + previewExt,
      quality_status: "копия",
      source_note: sourceNote,
      provenance_type: "собственное документальное фото",
      original_owner: submitterName,
      approx_date_text: s.approx_date_text,
      location_text: s.location_text,
      attributed_by: submitterName,
      attribution_confidence: "не проверено",
      publication_permission: "получено для внутреннего архива",
      legal_status: "Согласие подтверждено при загрузке",
      updated_at: now,
    });

    if (!ie) {
      mediaInserted = true;
      break;
    }
    await admin.storage.from(WORK_BUCKET).remove([workingPath]);
    if (ie.code !== "23505") {
      return response({ error: "archive_record_failed", detail: ie.message }, 422);
    }
  }

  if (!mediaInserted) {
    return response({ error: "media_id_allocation_failed" }, 409);
  }

  const { error: ve } = await admin.from("archive_media_versions").insert({
    media_id: mediaId,
    version_no: 1,
    storage_path: workingPath,
    file_name: safeBaseName(s.original_file_name) + "." + previewExt,
    version_type: "копия",
    reason: "Принято из пользовательской очереди",
    source_note: s.source_note || "Предоставил(а): " + String(submitterName),
    width: s.preview_width,
    height: s.preview_height,
    file_size: s.preview_file_size,
    created_by: user.id,
    is_current: true,
  });

  if (ve) {
    await admin.from("archive_media").delete().eq("id", mediaId);
    await admin.storage.from(WORK_BUCKET).remove([workingPath]);
    return response({ error: "archive_version_failed", detail: ve.message }, 422);
  }

  const { data: updated, error: ue } = await admin
    .from("photo_submissions")
    .update({
      status: "accepted",
      media_id: mediaId,
      moderator_note: note,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", submissionId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (ue || !updated) {
    await admin.from("archive_media_versions").delete().eq("media_id", mediaId);
    await admin.from("archive_media").delete().eq("id", mediaId);
    await admin.storage.from(WORK_BUCKET).remove([workingPath]);
    return response(
      { error: ue ? "submission_update_failed" : "submission_already_reviewed", detail: ue?.message },
      ue ? 422 : 409,
    );
  }

  await admin.storage.from(PENDING_BUCKET).remove([s.preview_storage_path]);
  await admin.from("archive_original_objects")
    .update({
      media_id:mediaId,
      submission_id:submissionId,
      updated_at:new Date().toISOString(),
    })
    .eq("source_bucket",SOURCE_BUCKET)
    .eq("source_path",s.original_storage_path);
  await notifySubmitter(
    "Фото принято в архив",
    "Фотография «" + s.title + "» добавлена как " + mediaId + ".",
  );

  return response({
    ok: true,
    decision: "approve",
    submissionId,
    mediaId,
    workingPath,
  });
});
