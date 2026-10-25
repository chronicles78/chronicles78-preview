"""Build an offline, fictional preview from the actual mini-app UI sources."""
from pathlib import Path
import base64
import hashlib
import re
root = Path(__file__).resolve().parents[2]
html = (root / 'keeper/index.html').read_text()
css = (root / 'keeper/style.css').read_text()
js = (root / 'keeper/app.mjs').read_text().replace("demo=new URL(location.href).searchParams.get('demo')==='1'", 'demo=true')
assert 'demo=true' in js

def digest(text):
    return base64.b64encode(hashlib.sha256(text.encode()).digest()).decode()

policy = "default-src 'none'; script-src 'sha256-" + digest(js) + "'; style-src 'sha256-" + digest(css) + "'; connect-src 'none'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
html = re.sub(r'(<meta http-equiv="Content-Security-Policy" content=")[^"]*(">)', lambda m: m[1] + policy + m[2], html)
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
html = html.replace('<script type="module" src="app.mjs"></script>', '<script type="module">' + js + '</script>')
# Brand returns to the same standalone file without leaving demo mode.
html = html.replace('href="./"', 'href="#"')
html = re.sub(r'<nav class="legal-links".*?</nav>', '', html, flags=re.S)
html = html.replace("document.querySelector('.brand').href='?demo=1';", "document.querySelector('.brand').href='#';")
# The final replacement changes script bytes, so update its CSP digest.
final_js = re.search(r'<script type="module">(.*?)</script>', html, re.S)[1]
html = html.replace(digest(js), digest(final_js))
(root / 'previews/keeper-miniapp-v1.html').write_text(html)
print('Built previews/keeper-miniapp-v1.html (offline, fictional data)')
