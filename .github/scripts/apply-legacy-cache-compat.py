from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / 'vercel.json'

NO_STORE = 'no-store, no-cache, must-revalidate, max-age=0'
LEGACY_ASSETS = [
    '/teacher-core-v68-6.js',
    '/teacher-core-v68-6.css',
    '/teacher-session-core-v68-6.js',
    '/teacher-progressive-boot-v68.js',
    '/teacher-theme-v68-7.js',
    '/teacher-theme-v68-7.css',
    '/teacher-mobile-compat-v68-8.css',
    '/teacher-command-center-v70.js',
    '/teacher-command-center-v70.css',
    '/teacher-agenda-v75.js',
    '/teacher-agenda-v75.css',
    '/teacher-periods-v76.js',
    '/teacher-periods-v76.css',
    '/teacher-router-v76-2.js',
    '/proyectar-v2.js',
    '/projection-premium-v54.css',
    '/control-v59.js',
    '/control-v59.css',
    '/control-premium-v54.css',
    '/student-v60.js',
    '/student-v60.css',
    '/student-security-v67.js',
    '/academic-analytics-v61.js',
    '/academic-analytics-v61.css',
    '/admin-v62.js',
    '/admin-v62.css',
    '/account-guard-v62.js',
    '/entitlements-v63.js',
    '/entitlements-v63.css',
    '/runtime-core-v64.js',
    '/beta-session-stability-v1.js',
    '/auth-handoff-v68-3.js',
    '/question-studio-v65.js',
    '/question-studio-v65.css',
    '/assignments-v66.js',
    '/assignments-v66.css',
    '/assignment-v66.js',
    '/assignment-v66.css',
    '/security-commercial-v67.js',
    '/security-commercial-v67.css',
    '/onboarding-v68.js',
    '/onboarding-v68.css',
    '/status-v67.js',
    '/status-v67.css',
    '/attendance-checkin-v2.js',
    '/attendance-premium-v54.css',
    '/tedvio-premium-v54.css',
    '/beta-pilot-ready-v1.js',
    '/beta-pilot-ready-v1.css',
    '/beta-executive-v56.css',
    '/beta-pilot-ready-v57.js',
    '/beta-smart-dashboard-v57.css',
    '/live-classroom-v58.js',
    '/live-classroom-v58.css',
    '/live-classroom-v58-qr-fix.css',
    '/beta-attendance-pro-v1.js',
    '/beta-attendance-pro-v1.css',
    '/beta-group-center-v2.js',
    '/beta-student-live-v1.js',
    '/beta-stability.js',
    '/beta-brand-v2.js',
    '/beta-runtime-hooks.js',
    '/beta.css',
    '/beta-pro-max.css',
]

config = json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
headers = config.setdefault('headers', [])
existing = {str(row.get('source', '')) for row in headers}
new_rows = [
    {
        'source': source,
        'headers': [{'key': 'Cache-Control', 'value': NO_STORE}],
    }
    for source in LEGACY_ASSETS
    if source not in existing
]

asset_index = next(
    (index for index, row in enumerate(headers) if row.get('source') == '/teacher-v2/assets/(.*)'),
    len(headers),
)
headers[asset_index:asset_index] = new_rows
CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Added {len(new_rows)} explicit legacy no-store rules.')
