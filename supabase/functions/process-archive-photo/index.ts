import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
} from "npm:@imagemagick/magick-wasm@0.0.43";

const wasmBytes = await Deno.readFile(
  new URL(
    "magick.wasm",
    import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.43"),
  ),
);
await initializeImageMagick(wasmBytes);

const MAX_SIDE = 1920;
const QUALITY = 82;
const SOURCE_BUCKET = "archive-originals";
const WORK_BUCKET = "archive-media";

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
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.is_active) {
    return response({ error: "inactive_profile" }, 403);
  }
  if (!["editor", "admin"].includes(String(profile.role))) {
    return response({ error: "not_allowed" }, 403);
  }

  let input: {
    mediaId?: string;
    originalPath?: string;
    fileName?: string;
    versionType?: string;
    reason?: string | null;
    sourceNote?: string | null;
  };
  try {
    input = await req.json();
  } catch {
    return response({ error: "invalid_json" }, 400);
  }

  const mediaId = String(input.mediaId || "").trim();
  const originalPath = String(input.originalPath || "").trim();
  const fileName = String(input.fileName || "photo.jpg").trim();
  const versionType = String(input.versionType || "копия").trim();
  if (!mediaId || !originalPath) {
    return response({ error: "media_id_and_original_path_required" }, 400);
  }
  if (!originalPath.startsWith(user.id + "/")) {
    return response({ error: "original_path_not_owned_by_user" }, 403);
  }

  const { data: media, error: mediaError } = await admin
    .from("archive_media")
    .select("id,data")
    .eq("id", mediaId)
    .maybeSingle();
  if (mediaError || !media) return response({ error: "media_not_found" }, 404);

  const { data: sourceBlob, error: downloadError } = await admin.storage
    .from(SOURCE_BUCKET)
    .download(originalPath);
  if (downloadError || !sourceBlob) {
    return response(
      { error: "original_download_failed", detail: downloadError?.message },
      422,
    );
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
  const baseData = committedMedia?.data || media.data || {};
  const history = Array.isArray(baseData.original_history)
    ? baseData.original_history
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
