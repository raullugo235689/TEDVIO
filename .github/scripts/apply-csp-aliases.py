from pathlib import Path
import json

root = Path(__file__).resolve().parents[2]
vercel_path = root / 'vercel.json'
config = json.loads(vercel_path.read_text(encoding='utf-8'))
headers = config.get('headers', [])

def entry(source: str):
    return next((item for item in headers if item.get('source') == source), None)

template = entry('/teacher')
if not template:
    raise RuntimeError('No se encontró la política canónica de /teacher')

csp = next((item['value'] for item in template.get('headers', []) if item.get('key') == 'Content-Security-Policy'), '')
if not csp:
    raise RuntimeError('No se encontró CSP aplicada')

for source in ['/auth/confirm/', '/auth/recovery/', '/teacher-v2', '/teacher-v2/']:
    current = entry(source)
    if current is None:
        current = {'source': source, 'headers': []}
        headers.append(current)
    values = {item.get('key'): item for item in current.get('headers', [])}
    values['Cache-Control'] = {
        'key': 'Cache-Control',
        'value': 'no-store, no-cache, must-revalidate, max-age=0',
    }
    values['Content-Security-Policy'] = {
        'key': 'Content-Security-Policy',
        'value': csp,
    }
    current['headers'] = list(values.values())

config['headers'] = headers
vercel_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

check_path = root / 'apps/teacher-v2/scripts/security-check.mjs'
check = check_path.read_text(encoding='utf-8')
old = "['/teacher', '/teacher/', '/teacher-v2/index.html', '/auth/confirm', '/auth/recovery']"
new = "['/teacher', '/teacher/', '/teacher-v2', '/teacher-v2/', '/teacher-v2/index.html', '/auth/confirm', '/auth/confirm/', '/auth/recovery', '/auth/recovery/']"
if old not in check:
    raise RuntimeError('No se encontró la lista de rutas canónicas')
check = check.replace(old, new, 1).replace('canonicalPolicies.length === 5', 'canonicalPolicies.length === 9', 1)
check_path.write_text(check, encoding='utf-8')
