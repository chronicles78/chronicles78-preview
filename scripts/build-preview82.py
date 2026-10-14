"""Package the pinned v82 frontend for an isolated temporary static site."""
from pathlib import Path
import json
import hashlib
import os
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'preview-dist'
UI_REVISION = '373b2b25eee7ea6f3c252c8f37031dbb3b987887'
PAGES = ('index.html', 'register.html', 'consent.html', 'about.html',
         'privacy.html', 'terms.html', 'home-2.html', 'home-2-sources.html')

# Render uses a shallow clone; verify exact source files without needing old Git objects.
expected = json.loads((ROOT / 'scripts/preview82-files.json').read_text())
if expected['source_revision'] != UI_REVISION:
    raise ValueError('Unexpected source revision')
actual_paths = set(PAGES) | {'manifest.webmanifest'} | {
    p.relative_to(ROOT).as_posix() for p in (ROOT / 'assets').rglob('*') if p.is_file()
}
if actual_paths != set(expected['files']):
    raise ValueError('Unexpected frontend file set')
for relative, digest in expected['files'].items():
    if hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() != digest:
        raise ValueError(f'Frontend differs from pinned v82: {relative}')
revision = os.environ.get('RENDER_GIT_COMMIT') or subprocess.check_output(
    ['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
if not re.fullmatch(r'[0-9a-f]{40}', revision):
    raise ValueError('A complete Git revision is required')
if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir()
for asset in (ROOT / 'assets').rglob('*'):
    if asset.is_symlink():
        raise ValueError(f'Symlink not allowed in static assets: {asset}')
shutil.copytree(ROOT / 'assets', OUT / 'assets')
for name in (*PAGES, 'manifest.webmanifest'):
    shutil.copy2(ROOT / name, OUT / name)
# The production site uses Jekyll for this one resource; the preview uses static JSON.
(OUT / 'version.json').write_text(json.dumps({'revision': revision}) + '\n')
(OUT / 'preview-info.json').write_text(json.dumps({
    'version': 82, 'temporary_preview': True,
    'source_revision': UI_REVISION, 'build_revision': revision,
    'production_url': 'https://chronicles78.github.io/chronicles78-preview/',
}, ensure_ascii=False, indent=2) + '\n')
(OUT / 'robots.txt').write_text('User-agent: *\nDisallow: /\n')
# A tab label distinguishes the sites without adding overlays to the compared layout.
p = OUT / 'index.html'
p.write_text(p.read_text().replace('<title>Главная · Хроники-78</title>',
    '<title>Предпросмотр 82 · Хроники-78</title>'))
(OUT / 'compare.html').write_text('''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><title>Сравнение версий · Хроники-78</title>
<style>body{max-width:760px;margin:40px auto;padding:24px;background:#fff9ed;color:#12374f;font:18px/1.6 Georgia,serif}h1{line-height:1.2}a{display:block;margin:16px 0;padding:16px;border:1px solid #d7c9ae;border-radius:8px;color:inherit;text-decoration:none}a:hover{background:#f0e2c5}small{display:block;font:15px/1.5 sans-serif;color:#526270}</style></head>
<body><h1>«Хроники-78»: сравнение оформления</h1><p>Откройте версии в отдельных вкладках или окнах.</p>
<a href="https://chronicles78.github.io/chronicles78-preview/" target="_blank" rel="noopener">Действующий сайт · версия 81</a>
<a href="./" target="_blank" rel="noopener">Временный предпросмотр · версия 82</a>
<small>Предпросмотр использует прежний закрытый архив. Для закрытых разделов нужно войти на каждом сайте отдельно. На iPhone сравните портретное и альбомное положение, меню чата и поле ввода с открытой клавиатурой.</small></body></html>''')
print(f'Packaged v82 from {UI_REVISION}: {len(list(OUT.rglob("*")))} entries')
