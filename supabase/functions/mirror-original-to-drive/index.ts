import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.7/cors";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function googleAccessToken() {
  const clientId = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_DRIVE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("google_drive_oauth_not_configured");
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson?.access_token) {
    throw new Error("google_token_refresh_failed: " + JSON.stringify(tokenJson));
  }
  return String(tokenJson.access_token);
}

async function uploadToDrive(args: {
  accessToken: string;
  folderId: string;
  objectId: string;
  fileName: string;
  mimeType: string;
  blob: Blob;
}) {
  const boundary = "chronicles78_" + crypto.randomUUID().replaceAll("-", "");
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelimiter = "\r\n--" + boundary + "--";
  const metadata = {
    name: args.fileName,
    parents: [args.folderId],
    description: "Хроники-78 · глубокий архив оригиналов",
    appProperties: {
      chronicles78_object_id: args.objectId,
    },
  };
  const requestBody = new Blob([
    "--" + boundary + "\r\n",
    "Content-Type: application/json; charset=UTF-8\r\n\r\n",
    JSON.stringify(metadata),
    delimiter,
    "Content-Type: " + args.mimeType + "\r\n\r\n",
    args.blob,
    closeDelimiter,
  ]);
  const driveRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,mimeType,md5Checksum,webViewLink,createdTime,trashed,parents",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + args.accessToken,
        "Content-Type": "multipart/related; boundary=" + boundary,
      },
      body: requestBody,
    },
  );
  const driveJson = await driveRes.json();
  if (!driveRes.ok || !driveJson?.id) {
    throw new Error("google_drive_upload_failed: " + JSON.stringify(driveJson));
  }
  return driveJson;
}

async function getDriveFile(accessToken: string, fileId: string) {
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(fileId) +
      "?fields=id,name,size,mimeType,md5Checksum,webViewLink,createdTime,trashed,parents",
    { headers: { Authorization: "Bearer " + accessToken } },
  );
  if (res.status === 404) return null;
  const json = await res.json();
  if (!res.ok) throw new Error("google_drive_verify_failed: " + JSON.stringify(json));
  return json;
}

async function findDriveFile(accessToken: string, folderId: string, objectId: string) {
  const escaped = objectId.replaceAll("'", "\\'");
  const q = [
    "trashed = false",
    "'" + folderId.replaceAll("'", "\\'") + "' in parents",
    "appProperties has { key='chronicles78_object_id' and value='" + escaped + "' }",
  ].join(" and ");
  const url = "https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent(q) +
    "&pageSize=2&fields=files(id,name,size,mimeType,md5Checksum,webViewLink,createdTime,trashed,parents)";
  const res = await fetch(url, { headers: { Authorization: "Bearer " + accessToken } });
  const json = await res.json();
  if (!res.ok) throw new Error("google_drive_lookup_failed: " + JSON.stringify(json));
  return json?.files?.[0] || null;
}

function verifyDriveFile(file: any, expectedSize: number, folderId: string) {
  if (!file?.id || file.trashed === true) throw new Error("google_drive_file_missing");
  if (!Array.isArray(file.parents) || !file.parents.includes(folderId)) {
    throw new Error("google_drive_parent_mismatch");
  }
  if (Number(file.size) !== Number(expectedSize)) {
    throw new Error("google_drive_size_mismatch: expected=" + expectedSize + " actual=" + file.size);
  }
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
  const workerSecret = Deno.env.get("GOOGLE_DRIVE_CRON_SECRET") || "";
  const suppliedWorkerSecret = req.headers.get("x-chronicles-cron-secret") || "";
  const isWorker = !!workerSecret && suppliedWorkerSecret === workerSecret;
  if (!jwt && !isWorker) return response({ error: "authentication_required" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let callerRole = isWorker ? "worker" : "";
  if (!isWorker) {
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    const user = authData?.user;
    if (authError || !user) return response({ error: "invalid_session" }, 401);

    const { data: profile } = await admin
      .from("profiles")
      .select("role,is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_active || !["editor", "admin"].includes(String(profile.role))) {
      return response({ error: "not_allowed" }, 403);
    }
    callerRole = String(profile.role);
  }

  let input: {
    objectId?: string;
    limit?: number;
    releaseSupabase?: boolean;
  };
  try {
    input = await req.json();
  } catch {
    input = {};
  }

  const releaseSupabase = input.releaseSupabase === true;
  if (releaseSupabase && !["admin", "worker"].includes(callerRole)) {
    return response({ error: "admin_required_to_release_supabase_copy" }, 403);
  }

  const { data: backend, error: backendError } = await admin
    .from("archive_storage_backends")
    .select("*")
    .eq("code", "google_drive")
    .maybeSingle();

  if (backendError || !backend) {
    return response({ error: "google_drive_backend_missing" }, 503);
  }
  if (!backend.enabled) {
    return response({
      error: "google_drive_backend_disabled",
      detail: "OAuth secrets must be configured before enabling the backend.",
      folderId: backend.originals_folder_id,
    }, 409);
  }
  if (!backend.originals_folder_id) {
    return response({ error: "google_drive_folder_missing" }, 503);
  }
  const deletionEnabled = backend.config?.delete_supabase_after_mirror === true;

  let query = admin
    .from("archive_original_objects")
    .select("*")
    .is("source_deleted_at", null)
    .in("mirror_status", releaseSupabase ? ["pending", "failed", "mirrored"] : ["pending", "failed"])
    .order("created_at", { ascending: true });

  const objectId = String(input.objectId || "").trim();
  if (objectId) query = query.eq("id", objectId);
  else query = query.limit(Math.max(1, Math.min(20, Number(input.limit) || 5)));

  const { data: objects, error: objectsError } = await query;
  if (objectsError) return response({ error: "objects_query_failed", detail: objectsError.message }, 422);
  if (!objects?.length) return response({ ok: true, processed: 0, items: [] });

  let accessToken = "";
  try {
    accessToken = await googleAccessToken();
  } catch (error) {
    return response({
      error: "google_drive_auth_failed",
      detail: error instanceof Error ? error.message : String(error),
    }, 503);
  }

  const items: unknown[] = [];

  for (const obj of objects) {
    await admin
      .from("archive_original_objects")
      .update({
        mirror_status: "mirroring",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", obj.id);

    try {
      const { data: blob, error: downloadError } = await admin.storage
        .from(obj.source_bucket)
        .download(obj.source_path);
      if (downloadError || !blob) {
        throw new Error("source_download_failed: " + (downloadError?.message || ""));
      }

      let driveFile = obj.external_file_id
        ? await getDriveFile(accessToken, obj.external_file_id)
        : null;
      if (!driveFile) {
        driveFile = await findDriveFile(accessToken, backend.originals_folder_id, obj.id);
      }
      if (!driveFile) {
        driveFile = await uploadToDrive({
          accessToken,
          folderId: backend.originals_folder_id,
          objectId: obj.id,
          fileName: obj.file_name || obj.source_path.split("/").pop() || "photo",
          mimeType: obj.mime_type || blob.type || "application/octet-stream",
          blob,
        });
      }
      verifyDriveFile(driveFile, Number(obj.file_size || blob.size), backend.originals_folder_id);

      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        external_provider: "google_drive",
        external_file_id: driveFile.id,
        external_folder_id: backend.originals_folder_id,
        external_url: driveFile.webViewLink || null,
        mirror_status: "mirrored",
        mirrored_at: now,
        last_error: null,
        updated_at: now,
      };

      if (releaseSupabase && deletionEnabled) {
        const { error: removeError } = await admin.storage
          .from(obj.source_bucket)
          .remove([obj.source_path]);
        if (removeError) {
          patch.last_error = "Drive copy created, but Supabase source was not deleted: " + removeError.message;
        } else {
          patch.source_deleted_at = now;
          patch.storage_backend = "google_drive";
        }
      }

      await admin.from("archive_original_objects").update(patch).eq("id", obj.id);
      items.push({
        id: obj.id,
        ok: true,
        driveFileId: driveFile.id,
        verified: true,
        released: releaseSupabase && deletionEnabled && !!patch.source_deleted_at,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await admin
        .from("archive_original_objects")
        .update({
          mirror_status: "failed",
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", obj.id);
      items.push({ id: obj.id, ok: false, error: message });
    }
  }

  return response({
    ok: true,
    processed: items.length,
    releaseSupabase,
    deletionEnabled,
    items,
  });
});
