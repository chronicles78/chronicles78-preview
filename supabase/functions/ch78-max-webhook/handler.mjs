import {handleCallback} from './callbacks.mjs';
// CH78-MAX-001: authenticated, insert-only message_created receiver.
// message_created remains insert-only. Authenticated callbacks use a separate
// bounded, deduplicated MAX reply branch; no OpenAI calls in this function.
export const PROJECT_URL = 'https://fnwpkmjjdhflnqghnogj.supabase.co';
export const MAX_BYTES = 262144;
const encoder = new TextEncoder();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const reply = (status, data) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function secretMatches(received, expected) {
  const hash = value => crypto.subtle.digest('SHA-256', encoder.encode(value));
  const [a, b] = await Promise.all([hash(received), hash(expected)]);
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i];
  return difference === 0;
}

class InvalidRequest extends Error {
  constructor(status) { super('invalid request'); this.status = status; }
}
async function readBody(req) {
  const declared = req.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) {
    throw new InvalidRequest(/^\d+$/.test(declared) ? 413 : 400);
  }
  if (!req.body) throw new InvalidRequest(400);
  const reader = req.body.getReader();
  const parts = []; let size = 0, timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new InvalidRequest(408)), 5000);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) throw new InvalidRequest(413);
      parts.push(value);
    }
    const raw = new Uint8Array(size); let offset = 0;
    for (const part of parts) { raw.set(part, offset); offset += part.length; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
    catch { throw new InvalidRequest(400); }
  } finally {
    clearTimeout(timer);
    // Do not wait indefinitely for an untrusted stream's cancel callback.
    reader.cancel().catch(() => {});
  }
}

function canonical(value, depth = 0) {
  if (depth > 32) throw new InvalidRequest(400);
  if (Array.isArray(value)) return value.map(item => canonical(item, depth + 1));
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key], depth + 1)]));
  return value;
}
export async function normalize(update, chatId) {
  if (!object(update) || typeof update.update_type !== 'string') throw new InvalidRequest(400);
  if (update.update_type !== 'message_created') return null;
  if (!integer(update.timestamp) || !object(update.message)) throw new InvalidRequest(400);
  const m = update.message;
  if (!object(m.recipient) || !Number.isSafeInteger(m.recipient.chat_id)) throw new InvalidRequest(400);
  if (String(m.recipient.chat_id) !== chatId) return null;
  const forwardOnly = m.body === null && object(m.link);
  const b = forwardOnly ? {} : m.body;
  let mid = b?.mid;
  if (forwardOnly) {
    // MAX documents body=null for forward-only messages. There is no upstream mid.
    // Use a separate stable content identity; never pretend this is a native MAX ID.
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(canonical([update.timestamp, m]))));
    mid = 'forward-only:' + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  if (!object(b) || typeof mid !== 'string' || !mid.length || mid.length > 512 ||
      mid.includes('\0') || !integer(m.timestamp)) throw new InvalidRequest(400);
  if (b.text != null && (typeof b.text !== 'string' || b.text.includes('\0'))) throw new InvalidRequest(400);
  if (b.attachments != null && !Array.isArray(b.attachments)) throw new InvalidRequest(400);
  if (m.sender != null && !object(m.sender)) throw new InvalidRequest(400);
  if (m.link != null && !object(m.link)) throw new InvalidRequest(400);
  return {
    chat_id: chatId, message_id: mid, message_ts: m.timestamp,
    event_ts: update.timestamp, text: b.text ?? '', sender: m.sender ?? null,
    attachments: b.attachments ?? [], linked_message: m.link ?? null,
    source_message: m,
  };
}

export function createHandler({ env, fetchImpl = fetch }) {
  return async req => {
    if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    const enabled = env('CH78_MAX_INGEST_ENABLED') === 'true';
    const secret = env('CH78_MAX_WEBHOOK_SECRET') ?? '';
    const chatId = env('CH78_MAX_CHAT_ID') ?? '';
    const key = env('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!enabled) return reply(503, { error: 'ingest_disabled' });
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(secret) || !/^-?[1-9]\d{0,15}$/.test(chatId) ||
        !Number.isSafeInteger(Number(chatId)) || !key || env('SUPABASE_URL') !== PROJECT_URL) {
      return reply(503, { error: 'server_configuration' });
    }
    const received = req.headers.get('X-Max-Bot-Api-Secret') ?? '';
    if (received.length > 256 || !await secretMatches(received, secret)) return reply(403, { error: 'forbidden' });
    if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return reply(415, { error: 'json_required' });
    }
    try {
      const update=await readBody(req);
      if(update?.update_type==='message_callback')return await handleCallback(update,{env,fetchImpl});
      const row = await normalize(update, chatId);
      if (row === null) return reply(200, { ok: true, ignored: true });
      // A single atomic INSERT + composite PK gives idempotence even under races.
      // Do not ACK until PostgREST confirms the commit. Do not return message data.
      const response = await fetchImpl(PROJECT_URL + '/rest/v1/ch78_max_messages?on_conflict=chat_id,message_id', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { 'apikey': key, 'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json', 'Prefer': 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(row),
      });
      // Never reflect database error bodies or secrets into HTTP/logs.
      if (response.body) await response.body.cancel();
      if (!response.ok) return reply(503, { error: 'archive_unavailable' });
      return reply(200, { ok: true });
    } catch (error) {
      if (error instanceof InvalidRequest) return reply(error.status, { error: 'invalid_update' });
      return reply(503, { error: 'archive_unavailable' });
    }
  };
}
