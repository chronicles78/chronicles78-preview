"""Prepare a reviewable release; does not contact services or publish anything."""
from pathlib import Path
import hashlib
import json
import zipfile
root = Path(__file__).resolve().parents[2]
static = ['keeper/index.html', 'keeper/app.mjs', 'keeper/style.css', 'keeper/privacy.html', 'keeper/terms.html']
backend = [
    'supabase/functions/ch78-max-miniapp/index.ts',
    'supabase/functions/ch78-max-miniapp/handler.mjs',
    'supabase/functions/ch78-max-miniapp/auth.mjs',
    'supabase/functions/ch78-max-assistant/handler.mjs',
    'supabase/functions/ch78-max-worker/max-ca.mjs',
    'supabase/functions/ch78-max-ui/http.mjs',
]
other = ['supabase/migrations/20261023183326_ch78_max_miniapp.sql',
         'ops/ch78-max-enable-miniapp.sql', 'MAX_MINIAPP.md', 'MAX_MODERATION.md',
         'MAX_LAUNCH.md', 'assets/keeper/max-avatar-v1.png', 'previews/keeper-miniapp-v1.html']
paths = static + backend + other
for path in paths:
    assert (root / path).is_file(), path
manifest = {
    'kind': 'prepared_only_not_published',
    'project': 'Хранитель Хроник-78',
    'design_approved': '2026-10-23',
    'static_files': static,
    'edge_files': backend,
    'edge_name': 'ch78-max-miniapp',
    'edge_entrypoint': 'functions/ch78-max-miniapp/index.ts',
    'verify_jwt': False,
    'authentication': 'MAX HMAC signature plus current fixed-group membership',
    'proposed_host_path': '/chronicles78-preview/keeper/',
    'proposed_ai_questions_per_group_per_samara_day': 5,
    'max_openai_calls_per_question': 2,
    'searches_per_group_per_samara_day': 200,
    'both_feature_flags_default': False,
    'sha256': {p: hashlib.sha256((root / p).read_bytes()).hexdigest() for p in paths},
}
output = root / 'previews/ch78-miniapp-release.zip'
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as z:
    for path in paths:
        z.write(root / path, path)
    z.writestr('release.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
with zipfile.ZipFile(output) as z:
    assert z.testzip() is None
    for path, expected in manifest['sha256'].items():
        assert hashlib.sha256(z.read(path)).hexdigest() == expected, path
print(f'Prepared {output.name}: {len(paths)} files plus release.json; SHA-256 verified')
