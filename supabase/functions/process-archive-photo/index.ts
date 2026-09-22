import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
} from "npm:@imagemagick/magick-wasm@0.0.43";

const wasmBytes = await Deno.readFile(
  new URL("magick.wasm", import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.43")),
);
await initializeImageMagick(wasmBytes);

const MAX_SIDE = 1920;
const QUALITY = 82;
const SOURCE_BUCKET = "archive-originals";
const WORK_BUCKET = "archive-media";
const PENDING_BUCKET = "archive-pending";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    },
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return response({ ok: true });
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

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,is_active,display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.is_active) {
    return response({ error: "inactive_profile" }, 403);
  }

  let input: {
    mode?: "archive" | "submission" | "submission_ready";
    submissionId?: string;
    mediaId?: string;
    originalPath?: string;
    previewPath?: string;
    fileName?: string;
    versionType?: string;
    reason?: string | null;
    sourceNote?: string | null;
    title?: string;
    description?: string | null;
    approxDate?: string | null;
    location?: string | null;
    peopleNote?: string | null;
    permissionConfirmed?: boolean;
    originalFileSize?: number | null;
    sourceWidth?: number | null;
    sourceHeight?: number | null;
    previewWidth?: number | null;
    previewHeight?: number | null;
    previewFormat?: string | null;
  };
  try {
    input = await req.json();
  } catch {
    return response({ error: "invalid_json" }, 400);
  }

  const mode =
    input.mode === "submission_ready"
      ? "submission_ready"
      : input.mode === "submission"
        ? "submission"
        : "archive";

  if (
    mode === "archive" &&
    !["editor", "admin"].includes(String(profile.role))
  ) {
    return response({ error: "not_allowed" }, 403);
  }

  const mediaId = String(input.mediaId || "").trim();
  const originalPath = String(input.originalPath || "").trim();
  const fileName = String(input.fileName || "photo.jpg").trim();
  const versionType = String(input.versionType || "копия").trim();
  const title = String(input.title || "").trim();

  if (!originalPath) return response({ error: "original_path_required" }, 400);
  if (!originalPath.startsWith(user.id + "/")) {
    return response({ error: "original_path_not_owned_by_user" }, 403);
  }
  if (mode === "archive" && !mediaId) {
    return response({ error: "media_id_required" }, 400);
  }
  if (mode !== "archive") {
    if (!title) return response({ error: "title_required" }, 400);
    if (input.permissionConfirmed !== true) {
      return response({ error: "permission_confirmation_required" }, 400);
    }
  }

  const createSubmission = async (args: {
    id?: string;
    previewPath: string;
    originalBytes: number | null;
    sourceWidth: number | null;
    sourceHeight: number | null;
    previewWidth: number | null;
    previewHeight: number | null;
    previewBytes: number | null;
    previewFormat: string;
  }) => {
    const submissionId = args.id || crypto.randomUUID();
    const { error: submissionError } = await admin
      .from("photo_submissions")
      .insert({
        id: submissionId,
        submitted_by: user.id,
        title,
        description: String(input.description || "").trim() || null,
        approx_date_text: String(input.approxDate || "").trim() || null,
        location_text: String(input.location || "").trim() || null,
        people_note: String(input.peopleNote || "").trim() || null,
        source_note: String(input.sourceNote || "").trim() || null,
        permission_confirmed: true,
        original_storage_path: originalPath,
        preview_storage_path: args.previewPath,
        original_file_name: fileName,
        original_file_size: args.originalBytes,
        source_width: args.sourceWidth,
        source_height: args.sourceHeight,
        preview_width: args.previewWidth,
        preview_height: args.previewHeight,
        preview_file_size: args.previewBytes,
        preview_format: args.previewFormat,
        status: "pending",
      });

    if (submissionError) {
      return { error: submissionError, submissionId };
    }

    const { data: moderators } = await admin
      .from("profiles")
      .select("id")
      .eq("is_active", true)
      .in("role", ["editor", "admin"]);

    if (moderators?.length) {
      await admin.from("notifications").insert(
        moderators.map((m) => ({
          user_id: m.id,
          kind: "photo_submission",
          title: "Новое фото на проверку",
          body:
            String(profile.display_name || "Участник") +
            ": " +
            title,
          entity_type: "photo_submission",
          entity_id: submissionId,
        })),
      );
    }
    return { error: null, submissionId };
  };

  if (mode === "submission_ready") {
    const submissionId = String(input.submissionId || "").trim();
    const previewPath = String(input.previewPath || "").trim();
    if (!submissionId || !previewPath) {
      return response({ error: "submission_id_and_preview_path_required" }, 400);
    }
    if (!previewPath.startsWith(user.id + "/" + submissionId + "/")) {
      return response({ error: "preview_path_not_owned_by_submission" }, 403);
    }

    const { data: previewBlob, error: previewError } = await admin.storage
      .from(PENDING_BUCKET)
      .download(previewPath);
    if (previewError || !previewBlob) {
      return response({ error: "preview_not_found", detail: previewError?.message }, 422);
    }

    const made = await createSubmission({
      id: submissionId,
      previewPath,
      originalBytes: Number(input.originalFileSize) || null,
      sourceWidth: Number(input.sourceWidth) || null,
      sourceHeight: Number(input.sourceHeight) || null,
      previewWidth: Number(input.previewWidth) || null,
      previewHeight: Number(input.previewHeight) || null,
      previewBytes: previewBlob.size,
      previewFormat: String(input.previewFormat || "webp"),
    });
    if (made.error) {
      return response({ error: "submission_create_failed", detail: made.error.message }, 422);
    }
    return response({
      ok: true,
      mode: "submission_ready",
      submissionId: made.submissionId,
      originalPath,
      previewPath,
    });
  }

  let media: { id: string; data: Record<string, unknown> } | null = null;
  if (mode === "archive") {
    const { data, error } = await admin
      .from("archive_media")
      .select("id,data")
      .eq("id", mediaId)
      .maybeSingle();
    if (error || !data) return response({ error: "media_not_found" }, 404);
    media = data;
  }

  const { data: sourceBlob, error: downloadError } = await admin.storage
    .from(SOURCE_BUCKET)
    .download(originalPath);
  if (downloadError || !sourceBlob) {
    return response(
      { error: "original_download_failed", detail: downloadError?.message },
      422,
    );
  }
  if (sourceBlob.size > 25 * 1024 * 1024) {
    return response({ error: "original_too_large" }, 413);
  }

  const inputBytes = new Uint8Array(await sourceBlob.arrayBuffer());
  let sourceWidth = 0;
  let sourceHeight = 0;
  let width = 0;
  let height = 0;
  let optimized: Uint8Array;

  try {
    optimized = ImageMagick.read(inputBytes, (img): Uint8Array => {
      img.autoOrient();
      sourceWidth = img.width;
      sourceHeight = img.height;

      const longSide = Math.max(img.width, img.height);
      if (longSide > MAX_SIDE) {
        const scale = MAX_SIDE / longSide;
        width = Math.max(1, Math.round(img.width * scale));
        height = Math.max(1, Math.round(img.height * scale));
        img.resize(width, height);
      } else {
        width = img.width;
        height = img.height;
      }

      img.strip();
      img.quality = QUALITY;
      return img.write(MagickFormat.WebP, (data) => Uint8Array.from(data));
    });
  } catch (error) {
    return response(
      {
        error: "image_processing_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      422,
    );
  }

  if (mode === "submission") {
    const submissionId = crypto.randomUUID();
    const pendingPath = user.id + "/" + submissionId + "/preview.webp";
    const { error: pendingUploadError } = await admin.storage
      .from(PENDING_BUCKET)
      .upload(pendingPath, optimized, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: false,
      });
    if (pendingUploadError) {
      return response(
        { error: "pending_upload_failed", detail: pendingUploadError.message },
        422,
      );
    }

    const made = await createSubmission({
      id: submissionId,
      previewPath: pendingPath,
      originalBytes: inputBytes.byteLength,
      sourceWidth,
      sourceHeight,
      previewWidth: width,
      previewHeight: height,
      previewBytes: optimized.byteLength,
      previewFormat: "webp",
    });
    if (made.error) {
      await admin.storage.from(PENDING_BUCKET).remove([pendingPath]);
      return response(
        { error: "submission_create_failed", detail: made.error.message },
        422,
      );
    }

    return response({
      ok: true,
      mode: "submission",
      submissionId,
      originalPath,
      previewPath: pendingPath,
      sourceWidth,
      sourceHeight,
      width,
      height,
      originalBytes: inputBytes.byteLength,
      previewBytes: optimized.byteLength,
      format: "webp",
      quality: QUALITY,
    });
  }

  const stamp = Date.now();
  const workingPath =
    mediaId + "/web-" + stamp + "-" + safeBaseName(fileName) + ".webp";
  const { error: uploadError } = await admin.storage.from(WORK_BUCKET).upload(
    workingPath,
    optimized,
    {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    },
  );
  if (uploadError) {
    return response(
      { error: "optimized_upload_failed", detail: uploadError.message },
      422,
    );
  }

  const userClient = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_ANON_KEY") || serviceKey,
    {
      global: { headers: { Authorization: "Bearer " + jwt } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const { error: versionError } = await userClient.rpc(
    "replace_archive_media_version",
    {
      p_media_id: mediaId,
      p_storage_path: workingPath,
      p_file_name: safeBaseName(fileName) + ".webp",
      p_version_type: versionType,
      p_reason: input.reason || null,
      p_source_note: input.sourceNote || null,
      p_width: width,
      p_height: height,
      p_file_size: optimized.byteLength,
    },
  );

  if (versionError) {
    await admin.storage.from(WORK_BUCKET).remove([workingPath]);
    return response(
      { error: "version_commit_failed", detail: versionError.message },
      422,
    );
  }

  const { data: committedMedia } = await admin
    .from("archive_media")
    .select("data")
    .eq("id", mediaId)
    .maybeSingle();
  const baseData = committedMedia?.data || media?.data || {};
  const history = Array.isArray((baseData as any).original_history)
    ? (baseData as any).original_history
    : [];
  const nextData = {
    ...baseData,
    original_storage_path: originalPath,
    original_file_name: fileName,
    original_file_size: inputBytes.byteLength,
    source_width: sourceWidth,
    source_height: sourceHeight,
    optimized_format: "webp",
    optimized_max_side: MAX_SIDE,
    optimized_quality: QUALITY,
    processing_status: "ready",
    processed_at: new Date().toISOString(),
    original_history: [
      ...history,
      {
        storage_path: originalPath,
        file_name: fileName,
        file_size: inputBytes.byteLength,
        source_width: sourceWidth,
        source_height: sourceHeight,
        working_path: workingPath,
        working_file_size: optimized.byteLength,
        width,
        height,
        processed_at: new Date().toISOString(),
      },
    ].slice(-30),
  };

  await admin
    .from("archive_media")
    .update({ data: nextData, updated_at: new Date().toISOString() })
    .eq("id", mediaId);

  return response({
    ok: true,
    mode: "archive",
    mediaId,
    originalPath,
    workingPath,
    sourceWidth,
    sourceHeight,
    width,
    height,
    originalBytes: inputBytes.byteLength,
    workingBytes: optimized.byteLength,
    format: "webp",
    quality: QUALITY,
  });
});
