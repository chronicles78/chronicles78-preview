# CH78-MAX-002 — server retrieval and source-grounded drafts

Status (2026-10-21): migration applied and ch78-max-assistant v1 deployed with owner approval. Search verified in live database; owner-authenticated HTTP/model acceptance pending.
Stacked on CH78-MAX-001 branch commit `1550a401c2c41eba680d7dc78f6f02f5f89227d4`.
The intake is already active in Supabase. This stage does not alter it.

## Verified starting state

The one-time Mac importer reported 394/394 accepted messages. Live SQL found
396 records in the agreed group: 370 with text, 26 without text, no duplicate
keys. Both server control messages exist once. This is a point-in-time count;
new webhook events may increase it. Old local indexes are not uploaded or reused.

The deployed website `story-assistant` is now v14 (it was v12 in the earlier audit).
This change does not replace it or change the website assistant source. The new
function reads the same server secret names, without inspecting their values.

## Architecture and security

Adds a Russian FTS expression index and `ch78_max_search` SQL RPC. The RPC is
SECURITY INVOKER with empty search_path, executable only by service_role.
Existing table RLS, grants and data are preserved. There is no public archive
policy, SECURITY DEFINER shortcut, or client-select grant.

New isolated function `ch78-max-assistant`, `verify_jwt=false`, requires the
existing high-entropy `X-Max-Bot-Api-Secret` on **every** request before reading
its body or calling data/model APIs. This is an owner-only temporary interface,
not a participant API. Never embed that secret in frontend code. No browser CORS
access is added. Group is read exclusively from server configuration; request
chat_id is ignored. The function cannot send messages to MAX.

## Modes

`{ "action": "search", "q": "дискотека", "mode": "forms" }`

Search is free of model calls: Russian morphological full-text search, OR and
phrase syntax via websearch_to_tsquery. `literal` is case-insensitive exact
substring search, with ё/e kept distinct. Forms mode normalizes ё/e. These are
lexical methods, **not semantic embeddings**. Empty/stopword/no-match queries do
not return unrelated nearest messages. At most 8 matches are returned.

Each source has a real message ID, author, message timestamp and fixed local
reference S1, S2, etc. No fabricated MAX deep links, raw source JSON, attachment
URLs or source tokens are returned. Source text is capped at 4,000 characters
per source and 20,000 total; truncated sources are marked. This means an answer
can miss relevant material beyond that excerpt; there is no claim of exhaustive
archive/context retrieval in this stage.

`{ "action": "answer", "q": "Что вспоминали о школьных танцах?" }`

Answer explicitly enables model usage (at most two calls; no automatic paid retry):

1. A structured model response proposes 1–3 short keyword/synonym searches.
2. Server runs bounded lexical queries and combines/deduplicates hits.
3. If no sources exist, the server returns a no-evidence response without an
   answer-generation call. The planning call may already have incurred usage.
4. Otherwise a second structured response produces a draft with references.
5. References must exist in supplied sources and match inline [S1] citations.
   Unknown/missing citations, refused/incomplete/malformed model outputs fail
   closed. A model found=false result is replaced with a fixed no-evidence text.

API: existing OPENAI_API_KEY and STORY_ASSISTANT_MODEL (default gpt-5-mini),
Responses API, store=false, strict JSON schemas, bounded input/output and timeouts.
This does not assert zero retention, successful billing, account access, or
regional eligibility. Provider HTTP 403/429 is reported with sanitized codes.
Model requests have no tools or database-writing ability.

Both question and archive excerpts are treated as untrusted data in instructions.
Citation validation establishes reference integrity, **not truth or entailment**.
The model may still misinterpret a source; factual acceptance needs human review.
No autonomous publication or group replies are enabled by this change.

Worst-case per-request budget: 5s input + 45s planning + 3×8s search + 45s draft.
This endpoint must NOT be awaited from the MAX delivery webhook (30s deadline).
Later MAX replies need a durable job/outbox stage with its own approval.

## Validation

31 local tests: 9 intake + 10 assistant + 12 PostgreSQL/PGlite. Commands:

```
node --test tests/ch78-max-webhook.test.mjs tests/ch78-max-assistant.test.mjs
npm ci --ignore-scripts --prefix tests/ch78-max-db
npm test --prefix tests/ch78-max-db
deno check supabase/functions/ch78-max-webhook/index.ts supabase/functions/ch78-max-assistant/index.ts
```

Real Postgres text-search engine tests: Russian morphology, ё/e, literal mode,
OR, no-result/stopword behavior, per-group isolation, limits, invalid queries,
RPC access denial to anon/authenticated, SECURITY INVOKER and unchanged data/grants.
Mocks test model planning, source deduplication, citation failures, refusal,
incomplete output, hidden calls/cost boundaries and upstream error sanitization.
No real model calls are part of automatic tests.

An equivalent SELECT on the live archive, without applying this migration,
returned 2 matches for «дискотека», 4 for «школа», 0 for «танцы» and 0 for
«межзвёздный космолёт». This illustrates both morphology limits and real no-match
behavior; it does not validate LLM retrieval or response quality.

## Deployment and acceptance — pending approval

Apply only this new migration to fnwpkmjjdhflnqghnogj (do not bulk db push; remote
migration history includes changes absent from this repository). Then deploy
only ch78-max-assistant with custom-secret authentication. No new secret entry
is needed if existing configuration and OpenAI secret are valid.

Acceptance: verify private SQL/HTTP search, same real source IDs, no-match behavior,
wrong-secret rejection, one limited real answer call and honest no-evidence cases.
An authorized client must supply the owner secret locally; do not request it in
chat. The current connector cannot invoke that authenticated endpoint using
hidden server secret values. Production model access remains unverified here.

Rollback: remove/disable only this new assistant endpoint, revoke its RPC EXECUTE
or drop the new RPC/index after review. Preserve intake and all archived messages.
No UI change in this stage, so no visual regression claim is made.

Sources: Supabase full-text-search documentation and OpenAI Responses structured
outputs documentation were checked before implementation:

- https://supabase.com/docs/guides/database/full-text-search
- https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses

## Deployment verification — 2026-10-21

Migration ch78_max_search applied as remote history version 20261021175728.
ch78-max-assistant v1 ACTIVE, verify_jwt=false, deployed source matches tested
commit 86836bac23a19c28e1a5d51e8bc5daa5afd32d3e. No intake or website redeploy.
The intake was already v3 and story-assistant v14 at preflight; do not restore
older versions from historical notes.

Live SQL: 396 archive messages, 2 results for дискотека, 1 literal control match,
0 results for a deliberately unrelated query. anon/authenticated cannot execute
RPC; service_role can. SECURITY DEFINER is false. No new advisor finding on the
search RPC. HTTP without/with wrong shared secret returns 403. Valid-secret HTTP
and actual OpenAI processing require the owner-side client because the connector
cannot use hidden function environment secrets for requests. No real API model
call was performed in this deployment.

An owner-side AskKeeper helper was prepared with 4 additional synthetic tests.
Its initial checks call search only. Model usage requires choosing menu option 2;
no automatic retry or publication in MAX. It does not read the Mac archive.
