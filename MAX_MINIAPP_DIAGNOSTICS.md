# Mini-app diagnostics — 2026-10-25

Live MAX launch and lexical search confirmed by Igor and screenshots; test archive
412 messages. miniapp_enabled=true, miniapp_ai_enabled=true, separate budget 5/day.
Avatar/description and keeper URL entered in MAX; moderation outcome not inferred.

Incident: 2026-10-24T20:01:57Z answer attempt failed as answer_unavailable after
two reported model calls (3335 total tokens). Old record has no root failure code;
its cause cannot be reconstructed. No automatic replay or paid diagnostic request.

Diagnostic patch stores allowlisted stage/code/status only in private request results.
Unknown error messages and raw upstream payloads are never persisted as diagnostics.
Public first/cached responses exclude diagnostics and token telemetry. Success and
no-evidence paths tested through real assistant handler with mocked model responses.
No relaxed citation validation, new model calls, schema or frontend changes.

18 targeted tests and full 100 Node tests PASS; unchanged DB/client checks previously
passed. Deployment source equality must be checked after installation.
