#!/usr/bin/env python3
import json
import os
import subprocess
import tempfile
from pathlib import Path

import requests

TOKEN_URL = "https://oauth2.googleapis.com/token"
DRIVE_API = "https://www.googleapis.com/drive/v3"
DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3"
FOLDER_MIME = "application/vnd.google-apps.folder"
VIDEO_READY_ROOT_NAME = "Видео"
SOURCE_ROOT_NAME = "Видео — на конвертацию"
ORIGINALS_ROOT_NAME = "Видео — оригиналы"
ERRORS_ROOT_NAME = "Видео — ошибки"
SUPPORTED_EXTENSIONS = {
    ".3gp", ".avi", ".flv", ".m2ts", ".m4v", ".mkv", ".mov", ".mp4",
    ".mpeg", ".mpg", ".mts", ".ogg", ".ogv", ".ts", ".vob", ".webm", ".wmv"
}

ROOT_ID = os.environ["ARCHIVE_ROOT_FOLDER_ID"].strip()
CLIENT_ID = os.environ["GOOGLE_DRIVE_CLIENT_ID"].strip()
CLIENT_SECRET = os.environ["GOOGLE_DRIVE_CLIENT_SECRET"].strip()
REFRESH_TOKEN = os.environ["GOOGLE_DRIVE_REFRESH_TOKEN"].strip()
MAX_FILES = max(1, min(int(os.environ.get("MAX_FILES", "4")), 20))

session = requests.Session()
access_token = ""
summary = {
    "processed": 0,
    "converted": 0,
    "copied_without_reencode": 0,
    "remuxed": 0,
    "transcoded": 0,
    "archived_originals": 0,
    "failed": 0,
    "skipped": 0,
    "folders_created": 0,
}

def log(msg):
    print(msg, flush=True)

def die(msg):
    print(f"::error::{msg}", flush=True)
    raise SystemExit(1)

def refresh_access_token():
    global access_token
    r = session.post(TOKEN_URL, data={
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": REFRESH_TOKEN,
        "grant_type": "refresh_token",
    }, timeout=30)
    if not r.ok:
        die(f"Google OAuth refresh failed: HTTP {r.status_code} {r.text[:300]}")
    access_token = r.json().get("access_token", "")
    if not access_token:
        die("Google OAuth refresh returned no access_token")

def auth_headers(extra=None):
    h = {"Authorization": f"Bearer {access_token}"}
    if extra:
        h.update(extra)
    return h

def drive_get(path, params=None, stream=False):
    r = session.get(DRIVE_API + path, headers=auth_headers(), params=params, timeout=120, stream=stream)
    if r.status_code == 401:
        refresh_access_token()
        r = session.get(DRIVE_API + path, headers=auth_headers(), params=params, timeout=120, stream=stream)
    return r

def drive_post(path, *, params=None, json_body=None, headers=None, data=None):
    r = session.post(DRIVE_API + path, headers=auth_headers(headers), params=params, json=json_body, data=data, timeout=120)
    if r.status_code == 401:
        refresh_access_token()
        r = session.post(DRIVE_API + path, headers=auth_headers(headers), params=params, json=json_body, data=data, timeout=120)
    return r

def drive_patch(path, *, params=None, json_body=None):
    r = session.patch(DRIVE_API + path, headers=auth_headers({"Content-Type": "application/json"}), params=params, json=json_body, timeout=120)
    if r.status_code == 401:
        refresh_access_token()
        r = session.patch(DRIVE_API + path, headers=auth_headers({"Content-Type": "application/json"}), params=params, json=json_body, timeout=120)
    return r

def list_children(folder_id):
    out = []
    page_token = None
    while True:
        q = f"'{folder_id}' in parents and trashed = false"
        params = {
            "q": q,
            "pageSize": 1000,
            "fields": "nextPageToken,files(id,name,mimeType,size,parents,md5Checksum,appProperties)",
            "supportsAllDrives": "true",
            "includeItemsFromAllDrives": "true",
        }
        if page_token:
            params["pageToken"] = page_token
        r = drive_get("/files", params=params)
        if not r.ok:
            die(f"Drive list failed for {folder_id}: HTTP {r.status_code} {r.text[:500]}")
        j = r.json()
        out.extend(j.get("files", []))
        page_token = j.get("nextPageToken")
        if not page_token:
            return out

def find_child_folder(parent_id, name):
    target = name.casefold()
    for item in list_children(parent_id):
        if item.get("mimeType") == FOLDER_MIME and str(item.get("name", "")).casefold() == target:
            return item
    return None

def create_folder(parent_id, name):
    r = drive_post("/files", params={"fields": "id,name,parents", "supportsAllDrives": "true"}, json_body={
        "name": name,
        "mimeType": FOLDER_MIME,
        "parents": [parent_id],
    })
    if not r.ok:
        die(f"Cannot create Drive folder '{name}': HTTP {r.status_code} {r.text[:500]}")
    summary["folders_created"] += 1
    return r.json()

def ensure_folder(parent_id, name):
    return find_child_folder(parent_id, name) or create_folder(parent_id, name)

def ensure_path(root_id, parts):
    current = root_id
    for part in parts:
        current = ensure_folder(current, part)["id"]
    return current

def walk_files(root_id, relative=()):
    files = []
    for item in list_children(root_id):
        if item.get("mimeType") == FOLDER_MIME:
            files.extend(walk_files(item["id"], relative + (item["name"],)))
        else:
            files.append((item, relative))
    return files

def safe_stem(name):
    return Path(name).stem.strip() or "video"

def is_supported(file):
    name = str(file.get("name", ""))
    mime = str(file.get("mimeType", ""))
    return mime.startswith("video/") or Path(name).suffix.lower() in SUPPORTED_EXTENSIONS

def download_file(file_id, dest):
    r = drive_get(f"/files/{file_id}", params={"alt": "media", "supportsAllDrives": "true"}, stream=True)
    if not r.ok:
        raise RuntimeError(f"Drive download failed: HTTP {r.status_code} {r.text[:300]}")
    with open(dest, "wb") as fh:
        for chunk in r.iter_content(chunk_size=1024 * 1024):
            if chunk:
                fh.write(chunk)

def probe_media(path):
    p = subprocess.run([
        "ffprobe", "-v", "error",
        "-show_entries", "stream=index,codec_type,codec_name,pix_fmt,width,height",
        "-of", "json", str(path)
    ], capture_output=True, text=True)
    if p.returncode != 0:
        tail = "\n".join((p.stderr or "").splitlines()[-20:])
        raise RuntimeError("ffprobe failed:\n" + tail)
    try:
        info = json.loads(p.stdout or "{}")
    except json.JSONDecodeError as e:
        raise RuntimeError(f"ffprobe returned invalid JSON: {e}")
    videos = [x for x in info.get("streams", []) if x.get("codec_type") == "video"]
    audios = [x for x in info.get("streams", []) if x.get("codec_type") == "audio"]
    if not videos:
        raise RuntimeError("Во входном файле не найдена видеодорожка")
    return {"video": videos[0], "audio": audios[0] if audios else None}

def codecs_ready_for_web(info):
    video = info["video"]
    audio = info["audio"]
    width = int(video.get("width") or 0)
    height = int(video.get("height") or 0)
    return (
        video.get("codec_name") == "h264"
        and video.get("pix_fmt") == "yuv420p"
        and (not audio or audio.get("codec_name") == "aac")
        and width > 0 and height > 0
        and width <= 1920 and height <= 1080
    )

def mp4_has_faststart(path):
    moov_pos = None
    mdat_pos = None
    file_size = path.stat().st_size
    with open(path, "rb") as fh:
        pos = 0
        while pos + 8 <= file_size:
            fh.seek(pos)
            header = fh.read(8)
            if len(header) < 8:
                break
            size = int.from_bytes(header[:4], "big")
            kind = header[4:8]
            header_size = 8
            if size == 1:
                ext = fh.read(8)
                if len(ext) < 8:
                    break
                size = int.from_bytes(ext, "big")
                header_size = 16
            elif size == 0:
                size = file_size - pos
            if size < header_size or pos + size > file_size:
                break
            if kind == b"moov" and moov_pos is None:
                moov_pos = pos
            elif kind == b"mdat" and mdat_pos is None:
                mdat_pos = pos
            if moov_pos is not None and mdat_pos is not None:
                break
            pos += size
    return moov_pos is not None and (mdat_pos is None or moov_pos < mdat_pos)

def remux_to_mp4(src, dst):
    cmd = [
        "ffmpeg", "-hide_banner", "-nostdin", "-y", "-i", str(src),
        "-map", "0:v:0", "-map", "0:a:0?", "-sn",
        "-c", "copy", "-movflags", "+faststart", str(dst),
    ]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        tail = "\n".join((p.stderr or "").splitlines()[-30:])
        raise RuntimeError("FFmpeg remux failed:\n" + tail)
    if not dst.exists() or dst.stat().st_size == 0:
        raise RuntimeError("FFmpeg remux completed but MP4 is empty")

def convert_to_mp4(src, dst):
    vf = "bwdif=mode=send_frame:parity=auto:deint=interlaced,scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2"
    cmd = [
        "ffmpeg", "-hide_banner", "-nostdin", "-y", "-i", str(src),
        "-map", "0:v:0", "-map", "0:a:0?", "-sn",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
        "-movflags", "+faststart",
        str(dst),
    ]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        tail = "\n".join((p.stderr or "").splitlines()[-30:])
        raise RuntimeError("FFmpeg transcode failed:\n" + tail)
    if not dst.exists() or dst.stat().st_size == 0:
        raise RuntimeError("FFmpeg transcode completed but MP4 is empty")

def find_existing_output(folder_id, output_name, source_id):
    for item in list_children(folder_id):
        if item.get("mimeType") == FOLDER_MIME:
            continue
        if item.get("name") != output_name:
            continue
        props = item.get("appProperties") or {}
        if props.get("chronicles78SourceId") == source_id:
            return item
    return None

def drive_copy_exact(file_id, parent_id, name):
    r = drive_post(
        f"/files/{file_id}/copy",
        params={"fields": "id,name,size,parents,appProperties", "supportsAllDrives": "true"},
        json_body={
            "name": name,
            "parents": [parent_id],
            "appProperties": {
                "chronicles78SourceId": file_id,
                "chronicles78Normalized": "mp4-h264-aac-v1",
                "chronicles78Processing": "exact-copy",
            },
        },
    )
    if not r.ok:
        raise RuntimeError(f"Drive exact copy failed: HTTP {r.status_code} {r.text[:500]}")
    return r.json()

def upload_resumable(local_path, parent_id, name, source_id, processing="transcode"):
    metadata = {
        "name": name,
        "parents": [parent_id],
        "mimeType": "video/mp4",
        "appProperties": {
            "chronicles78SourceId": source_id,
            "chronicles78Normalized": "mp4-h264-aac-v1",
            "chronicles78Processing": processing,
        },
    }
    init = session.post(
        DRIVE_UPLOAD + "/files",
        params={"uploadType": "resumable", "supportsAllDrives": "true", "fields": "id,name,size,parents,appProperties"},
        headers=auth_headers({
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": "video/mp4",
            "X-Upload-Content-Length": str(local_path.stat().st_size),
        }),
        data=json.dumps(metadata),
        timeout=120,
    )
    if init.status_code == 401:
        refresh_access_token()
        return upload_resumable(local_path, parent_id, name, source_id, processing=processing)
    if not init.ok:
        raise RuntimeError(f"Drive resumable upload init failed: HTTP {init.status_code} {init.text[:500]}")
    location = init.headers.get("Location")
    if not location:
        raise RuntimeError("Drive resumable upload did not return Location")
    with open(local_path, "rb") as fh:
        up = session.put(location, headers={"Content-Type": "video/mp4"}, data=fh, timeout=3600)
    if not up.ok:
        raise RuntimeError(f"Drive upload failed: HTTP {up.status_code} {up.text[:500]}")
    return up.json()

def move_file(file_id, old_parent_id, new_parent_id):
    r = drive_patch(
        f"/files/{file_id}",
        params={
            "addParents": new_parent_id,
            "removeParents": old_parent_id,
            "fields": "id,name,parents",
            "supportsAllDrives": "true",
        },
        json_body={},
    )
    if not r.ok:
        raise RuntimeError(f"Drive move failed: HTTP {r.status_code} {r.text[:500]}")
    return r.json()

def upload_small_text(parent_id, name, text):
    boundary = "chronicles78-boundary"
    meta = json.dumps({"name": name, "parents": [parent_id], "mimeType": "text/plain"})
    body = (
        f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n"
        f"--{boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n{text}\r\n"
        f"--{boundary}--\r\n"
    ).encode("utf-8")
    r = session.post(
        DRIVE_UPLOAD + "/files",
        params={"uploadType": "multipart", "supportsAllDrives": "true", "fields": "id,name"},
        headers=auth_headers({"Content-Type": f"multipart/related; boundary={boundary}"}),
        data=body,
        timeout=120,
    )
    if not r.ok:
        log(f"::warning::Could not upload error log: HTTP {r.status_code} {r.text[:300]}")

def github_summary(lines):
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")

def main():
    refresh_access_token()
    if not ROOT_ID:
        die("ARCHIVE_ROOT_FOLDER_ID is empty")

    ready_root = ensure_folder(ROOT_ID, VIDEO_READY_ROOT_NAME)
    source_root = ensure_folder(ROOT_ID, SOURCE_ROOT_NAME)
    originals_root = ensure_folder(ROOT_ID, ORIGINALS_ROOT_NAME)
    errors_root = ensure_folder(ROOT_ID, ERRORS_ROOT_NAME)

    log(f"Ready video folder: {ready_root['id']}")
    log(f"Conversion inbox: {source_root['id']}")
    log(f"Originals archive: {originals_root['id']}")
    log(f"Errors folder: {errors_root['id']}")

    candidates = [(f, rel) for f, rel in walk_files(source_root["id"]) if is_supported(f)]
    candidates.sort(key=lambda x: (Path(str(x[0].get("name", ""))).suffix.lower() == ".mp4", "/".join(x[1]).casefold(), str(x[0].get("name", "")).casefold()))
    candidates = candidates[:MAX_FILES]

    if not candidates:
        log("No source videos waiting for conversion.")
        github_summary([
            "## Chronicles-78 video converter",
            "Очередь пуста. Новых видео для конвертации нет.",
            f"Создано служебных папок при этом запуске: {summary['folders_created']}.",
        ])
        return

    with tempfile.TemporaryDirectory(prefix="chronicles78-video-") as td:
        work = Path(td)
        for file, rel in candidates:
            summary["processed"] += 1
            file_id = file["id"]
            old_parent = (file.get("parents") or [source_root["id"]])[0]
            src_name = file.get("name") or f"video-{file_id}"
            out_name = safe_stem(src_name) + ".mp4"
            label = "/".join((*rel, src_name))
            log(f"\n=== {label} ===")
            ready_parent = ensure_path(ready_root["id"], rel)
            originals_parent = ensure_path(originals_root["id"], rel)
            errors_parent = ensure_path(errors_root["id"], rel)

            existing = find_existing_output(ready_parent, out_name, file_id)
            if existing:
                log(f"MP4 already uploaded for source {file_id}; archiving original without reconversion.")
                try:
                    move_file(file_id, old_parent, originals_parent)
                    summary["archived_originals"] += 1
                    summary["skipped"] += 1
                except Exception as e:
                    summary["failed"] += 1
                    log(f"::error::{label}: {e}")
                continue

            src_ext = Path(src_name).suffix or ".bin"
            src_local = work / (file_id + src_ext)
            out_local = work / (file_id + ".normalized.mp4")
            try:
                download_file(file_id, src_local)
                log(f"Downloaded {src_local.stat().st_size} bytes")
                info = probe_media(src_local)
                video = info["video"]
                audio = info["audio"]
                log(
                    "Probe: "
                    + f"video={video.get('codec_name')}/{video.get('pix_fmt')} "
                    + f"{video.get('width')}x{video.get('height')} "
                    + f"audio={(audio or {}).get('codec_name') if audio else 'none'}"
                )

                source_is_mp4 = Path(src_name).suffix.lower() == ".mp4" or str(file.get("mimeType", "")).lower() == "video/mp4"
                web_ready_codecs = codecs_ready_for_web(info)

                if source_is_mp4 and web_ready_codecs and mp4_has_faststart(src_local):
                    log("Mode: exact-copy (MP4 already H.264/AAC/yuv420p/faststart; no media rewrite)")
                    uploaded = drive_copy_exact(file_id, ready_parent, out_name)
                    summary["copied_without_reencode"] += 1
                elif web_ready_codecs:
                    log("Mode: remux (compatible codecs; no re-encoding)")
                    remux_to_mp4(src_local, out_local)
                    log(f"Remuxed MP4: {out_local.stat().st_size} bytes")
                    uploaded = upload_resumable(out_local, ready_parent, out_name, file_id, processing="remux")
                    summary["remuxed"] += 1
                else:
                    log("Mode: transcode to H.264/AAC/yuv420p")
                    convert_to_mp4(src_local, out_local)
                    log(f"Transcoded MP4: {out_local.stat().st_size} bytes")
                    uploaded = upload_resumable(out_local, ready_parent, out_name, file_id, processing="transcode")
                    summary["transcoded"] += 1

                log(f"Ready MP4: {uploaded.get('id')} / {out_name}")
                summary["converted"] += 1
                move_file(file_id, old_parent, originals_parent)
                summary["archived_originals"] += 1
                log("Original moved to archive.")
            except Exception as e:
                summary["failed"] += 1
                err = str(e)
                log(f"::error::{label}: {err}")
                try:
                    move_file(file_id, old_parent, errors_parent)
                    upload_small_text(errors_parent, safe_stem(src_name) + ".conversion-error.txt", err)
                except Exception as move_err:
                    log(f"::warning::Could not move failed source to errors: {move_err}")
            finally:
                for p in (src_local, out_local):
                    try:
                        p.unlink(missing_ok=True)
                    except Exception:
                        pass

    github_summary([
        "## Chronicles-78 video converter",
        f"Обработано: **{summary['processed']}**",
        f"Подготовлено MP4: **{summary['converted']}**",
        f"Без перекодирования, точная копия: **{summary['copied_without_reencode']}**",
        f"Remux без потери качества: **{summary['remuxed']}**",
        f"Перекодировано: **{summary['transcoded']}**",
        f"Оригиналов перемещено в архив: **{summary['archived_originals']}**",
        f"Пропущено как уже обработанные: **{summary['skipped']}**",
        f"Ошибок: **{summary['failed']}**",
        f"Создано папок: **{summary['folders_created']}**",
    ])
    log("\nSummary: " + json.dumps(summary, ensure_ascii=False))
    if summary["failed"]:
        raise SystemExit(2)

if __name__ == "__main__":
    main()
