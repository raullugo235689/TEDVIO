from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.rstrip() + "\n", encoding="utf-8")


write("apps/teacher-v2/scripts/phase6-check.mjs", r'''import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const sourceRoot = path.join(root, 'apps/teacher-v2/src');
const app = fs.readFileSync(path.join(sourceRoot, 'app/App.tsx'), 'utf8');
const shell = fs.readFileSync(path.join(sourceRoot, 'app/AppShell.tsx'), 'utf8');
const auth = fs.readFileSync(path.join(sourceRoot, 'features/auth/AuthProvider.tsx'), 'utf8');
const login = fs.readFileSync(path.join(sourceRoot, 'features/auth/LoginPage.tsx'), 'utf8');
const entry = fs.readFileSync(path.join(sourceRoot, 'main.tsx'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'apps/teacher-v2/index.html'), 'utf8');
const canonicalShell = fs.readFileSync(path.join(root, 'teacher-v2/index.html'), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/phase6-production-cutover.yml'), 'utf8');
const browserSpec = fs.readFileSync(path.join(root, 'tests/browser/phase6-cutover.spec.mjs'), 'utf8');
const styles = fs.readFileSync(path.join(sourceRoot, 'styles/phase-six.css'), 'utf8');
const appError = fs.readFileSync(path.join(sourceRoot, 'app/AppErrorBoundary.tsx'), 'utf8');

const errors = [];
function must(condition, message) {
  if (condition) console.log(`OK   ${message}`);
  else {
    errors.push(message);
    console.error(`FAIL ${message}`);
  }
}

function rewriteFor(source) {
  return (vercel.rewrites || []).find((entryValue) => entryValue.source === source);
}
function headerFor(source) {
  return (vercel.headers || []).find((entryValue) => entryValue.source === source);
}
function headerValue(entryValue, key) {
  return entryValue?.headers?.find((item) => item.key === key)?.value || '';
}

const canonicalRewrite = rewriteFor('/teacher');
const rollbackRewrite = rewriteFor('/teacher-legacy');
const canonicalCache = headerValue(headerFor('/teacher'), 'Cache-Control');
const indexCache = headerValue(headerFor('/teacher-v2/index.html'), 'Cache-Control');
const assetsCache = headerValue(headerFor('/teacher-v2/assets/(.*)'), 'Cache-Control');

must(canonicalRewrite?.destination === '/teacher-v2/index.html', '/teacher apunta al frontend unificado');
must(rollbackRewrite?.destination === '/teacher.html', '/teacher-legacy conserva el rollback');
must(/no-store|no-cache/i.test(canonicalCache), 'shell canónico no se almacena en caché');
must(/no-store|no-cache/i.test(indexCache), 'índice compilado no se sirve obsoleto');
must(/immutable/i.test(assetsCache), 'assets hashados utilizan caché inmutable');
must(!String(rollbackRewrite?.destination || '').includes('/teacher'), 'la versión anterior permanece disponible como rollback');

must(!indexHtml.includes('/legacy/') && !indexHtml.includes('teacher-core-v68'), 'el frontend principal no carga capas heredadas');
must(indexHtml.includes('manifest.webmanifest') && indexHtml.includes('canonical'), 'shell nuevo declara PWA y ruta canónica');
must(manifest.start_url === '/teacher' && manifest.id === '/teacher', 'PWA inicia en la ruta canónica');
must(
  auth.includes("authRedirect('/auth/confirm')")
    && app.includes("physicalPath === '/auth/confirm'")
    && app.includes('AuthCallbackPage'),
  'confirmación de correo vuelve mediante callback protegido',
);
must(
  auth.includes('resetPasswordForEmail')
    && auth.includes("authRedirect('/auth/recovery')")
    && auth.includes('PASSWORD_RECOVERY')
    && login.includes('Olvidé mi contraseña'),
  'acceso utiliza recuperación explícita y validada',
);
must(!login.includes('reconstru') && !login.includes('migraci'), 'la interfaz no se presenta como reconstrucción');
must(login.includes('Todo tu trabajo docente, en un solo lugar.'), 'el shell utiliza lenguaje orientado al producto');
must(appError.includes('/teacher-legacy') && appError.includes('reference'), 'un error de interfaz ofrece recuperación y rollback');

must(entry.includes('registerTedvioServiceWorker'), 'TEDVIO registra el service worker desde el frontend nuevo');
must(sw.includes('TEDVIO-SHELL-v70') && sw.includes('/teacher'), 'service worker invalida cachés antiguas y conoce el shell canónico');
must(manifest.shortcuts?.some((shortcut) => shortcut.url === '/teacher'), 'PWA conserva alias y fallback de navegación');
must(styles.includes('@media (max-width: 760px)') && styles.includes('app-error-card'), 'recuperación visual funciona en escritorio y móvil');
must(!app.includes('MigrationPage') && !app.includes('migrationStatus'), 'el router no contiene pantallas de migración');
must(!app.includes('OPENAI') && !entry.includes('OPENAI'), 'Fase 6 no introduce IA generativa ni costo por tokens');
must(version.compatibility === 'v76', 'version.json conserva la compatibilidad académica v76');
must(version.product_version === '2.0' && version.product_revision === 'phase6-production-cutover', 'version.json registra el corte del producto 2.0');
must(workflow.includes('chromium') && workflow.includes('webkit'), 'CI prueba el corte en Chromium y WebKit');
must(browserSpec.includes("page.goto('/teacher'") && browserSpec.includes("page.goto('/teacher-legacy'"), 'navegador valida ruta principal y rollback');
must(shell.includes('RouteErrorBoundary') && shell.includes('<Outlet />'), 'AppShell persiste mientras cada herramienta se recupera por separado');
must(canonicalShell.includes('/teacher-v2/assets/'), 'artefacto canónico referencia assets compilados locales');

if (errors.length) {
  console.error(`\n${errors.length} regla(s) de Fase 6 fallaron.`);
  process.exit(1);
}

console.log('\nTEDVIO 2.0 Phase 6 production cutover check passed.');
''')

write("supabase/migrations/20260831090000_tedvio_access_security_foundation_v21.sql", r'''create index if not exists tedvio_legal_documents_latest_required_idx
  on public.tedvio_legal_documents (document_key, effective_at desc, version desc)
  where status = 'published' and required;

create or replace function public.tedvio_required_legal_documents_v21()
returns table (
  document_key text,
  version text,
  title text,
  summary text,
  content_html text,
  effective_at timestamptz,
  required boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select
      d.document_key,
      d.version,
      d.title,
      d.summary,
      d.content_html,
      d.effective_at,
      d.required,
      row_number() over (
        partition by d.document_key
        order by d.effective_at desc, d.version desc
      ) as position
    from public.tedvio_legal_documents d
    where d.status = 'published'
      and d.required
  )
  select
    r.document_key,
    r.version,
    r.title,
    r.summary,
    r.content_html,
    r.effective_at,
    r.required
  from ranked r
  where r.position = 1
  order by r.document_key;
$$;

revoke all on function public.tedvio_required_legal_documents_v21() from public;
grant execute on function public.tedvio_required_legal_documents_v21() to anon, authenticated;

comment on function public.tedvio_required_legal_documents_v21() is
  'Returns the latest published required legal documents for pre-authentication consent in TEDVIO 2.1.';

create or replace function tedvio_private.capture_signup_legal_consents_v21()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acceptances jsonb := new.raw_user_meta_data -> 'tedvio_legal_acceptances';
  v_required_count integer := 0;
  v_accepted_count integer := 0;
begin
  -- Compatibility window: legacy clients may omit the payload until the
  -- frontend deployment has completed. When the payload is present, it is
  -- validated atomically and cannot claim an obsolete document version.
  if v_acceptances is null then
    return new;
  end if;

  if jsonb_typeof(v_acceptances) <> 'array' then
    raise exception using errcode = 'P0001', message = 'LEGAL_ACCEPTANCE_INVALID';
  end if;

  with latest as (
    select distinct on (d.document_key) d.document_key, d.version
    from public.tedvio_legal_documents d
    where d.status = 'published' and d.required
    order by d.document_key, d.effective_at desc, d.version desc
  ), accepted as (
    select distinct l.document_key, l.version
    from latest l
    join lateral jsonb_array_elements(v_acceptances) item on true
    where item ->> 'document_key' = l.document_key
      and item ->> 'document_version' = l.version
      and lower(coalesce(item ->> 'accepted', 'false')) = 'true'
  )
  select (select count(*) from latest), (select count(*) from accepted)
  into v_required_count, v_accepted_count;

  if v_required_count = 0 or v_accepted_count <> v_required_count then
    raise exception using errcode = 'P0001', message = 'LEGAL_ACCEPTANCE_REQUIRED';
  end if;

  with latest as (
    select distinct on (d.document_key) d.document_key, d.version
    from public.tedvio_legal_documents d
    where d.status = 'published' and d.required
    order by d.document_key, d.effective_at desc, d.version desc
  ), accepted as (
    select distinct l.document_key, l.version
    from latest l
    join lateral jsonb_array_elements(v_acceptances) item on true
    where item ->> 'document_key' = l.document_key
      and item ->> 'document_version' = l.version
      and lower(coalesce(item ->> 'accepted', 'false')) = 'true'
  )
  insert into public.tedvio_user_consents (
    user_id, document_key, document_version, accepted_at, source
  )
  select new.id, a.document_key, a.version, now(), 'teacher_v2_signup'
  from accepted a
  on conflict (user_id, document_key, document_version)
  do update set accepted_at = excluded.accepted_at, source = excluded.source;

  return new;
end;
$$;

revoke all on function tedvio_private.capture_signup_legal_consents_v21() from public;

comment on function tedvio_private.capture_signup_legal_consents_v21() is
  'Validates and records exact current legal-document versions supplied during signup. Legacy omission is temporarily tolerated until enforcement migration.';

drop trigger if exists tedvio_capture_signup_legal_consents_v21 on auth.users;
create trigger tedvio_capture_signup_legal_consents_v21
after insert on auth.users
for each row
execute function tedvio_private.capture_signup_legal_consents_v21();
''')

write("supabase/migrations/20260831090100_tedvio_required_legal_acceptance_v21.sql", r'''create or replace function public.tedvio_accept_required_legal_v21(
  p_source text default 'teacher_v2_gate'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  with latest as (
    select distinct on (d.document_key) d.document_key, d.version
    from public.tedvio_legal_documents d
    where d.status = 'published' and d.required
    order by d.document_key, d.effective_at desc, d.version desc
  ), upserted as (
    insert into public.tedvio_user_consents (
      user_id, document_key, document_version, accepted_at, source
    )
    select
      v_uid,
      l.document_key,
      l.version,
      now(),
      left(coalesce(nullif(btrim(p_source), ''), 'teacher_v2_gate'), 80)
    from latest l
    on conflict (user_id, document_key, document_version)
    do update set accepted_at = excluded.accepted_at, source = excluded.source
    returning 1
  )
  select count(*) into v_count from upserted;

  if v_count = 0 then
    raise exception using errcode = 'P0001', message = 'LEGAL_DOCUMENT_NOT_FOUND';
  end if;

  return v_count;
end;
$$;

revoke all on function public.tedvio_accept_required_legal_v21(text) from public;
grant execute on function public.tedvio_accept_required_legal_v21(text) to authenticated;

comment on function public.tedvio_accept_required_legal_v21(text) is
  'Atomically records acceptance of every latest required legal document for the authenticated TEDVIO user.';
''')

write("supabase/migrations/20260831100000_tedvio_access_security_enforcement_v21.sql", r'''create or replace function tedvio_private.capture_signup_legal_consents_v21()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acceptances jsonb := new.raw_user_meta_data -> 'tedvio_legal_acceptances';
  v_required_count integer := 0;
  v_accepted_count integer := 0;
begin
  if v_acceptances is null or jsonb_typeof(v_acceptances) <> 'array' then
    raise exception using errcode = 'P0001', message = 'LEGAL_ACCEPTANCE_REQUIRED';
  end if;

  with latest as (
    select distinct on (d.document_key) d.document_key, d.version
    from public.tedvio_legal_documents d
    where d.status = 'published' and d.required
    order by d.document_key, d.effective_at desc, d.version desc
  ), accepted as (
    select distinct l.document_key, l.version
    from latest l
    join lateral jsonb_array_elements(v_acceptances) item on true
    where item ->> 'document_key' = l.document_key
      and item ->> 'document_version' = l.version
      and lower(coalesce(item ->> 'accepted', 'false')) = 'true'
  )
  select (select count(*) from latest), (select count(*) from accepted)
  into v_required_count, v_accepted_count;

  if v_required_count = 0 or v_accepted_count <> v_required_count then
    raise exception using errcode = 'P0001', message = 'LEGAL_ACCEPTANCE_REQUIRED';
  end if;

  with latest as (
    select distinct on (d.document_key) d.document_key, d.version
    from public.tedvio_legal_documents d
    where d.status = 'published' and d.required
    order by d.document_key, d.effective_at desc, d.version desc
  ), accepted as (
    select distinct l.document_key, l.version
    from latest l
    join lateral jsonb_array_elements(v_acceptances) item on true
    where item ->> 'document_key' = l.document_key
      and item ->> 'document_version' = l.version
      and lower(coalesce(item ->> 'accepted', 'false')) = 'true'
  )
  insert into public.tedvio_user_consents (
    user_id, document_key, document_version, accepted_at, source
  )
  select new.id, a.document_key, a.version, now(), 'teacher_v2_signup'
  from accepted a
  on conflict (user_id, document_key, document_version)
  do update set accepted_at = excluded.accepted_at, source = excluded.source;

  return new;
end;
$$;

revoke all on function tedvio_private.capture_signup_legal_consents_v21() from public;

comment on function tedvio_private.capture_signup_legal_consents_v21() is
  'Enforces explicit acceptance of every latest required document and records exact versions for every new auth user.';
''')

write("supabase/tests/access_security_v21.sql", r'''-- TEDVIO 2.1 · Prueba transaccional de acceso y consentimientos.
-- Ejecutar únicamente con privilegios administrativos. Todo cambio se revierte.

begin;

create temporary table tedvio_signup_probe (
  id uuid not null,
  raw_user_meta_data jsonb not null
) on commit drop;

create trigger tedvio_signup_probe_trigger
after insert on tedvio_signup_probe
for each row
execute function tedvio_private.capture_signup_legal_consents_v21();

with probe_user as (
  select id from auth.users where deleted_at is null order by created_at limit 1
), payload as (
  select jsonb_build_object(
    'tedvio_legal_acceptances',
    jsonb_agg(jsonb_build_object(
      'document_key', d.document_key,
      'document_version', d.version,
      'accepted', true
    ))
  ) as metadata
  from public.tedvio_required_legal_documents_v21() d
)
insert into tedvio_signup_probe (id, raw_user_meta_data)
select u.id, p.metadata from probe_user u cross join payload p;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from auth.users where deleted_at is null order by created_at limit 1),
  true
);

select public.tedvio_accept_required_legal_v21('transactional_security_drill') as accepted_documents;
select count(*) as current_required_documents from public.tedvio_required_legal_documents_v21();

rollback;
''')

write(".github/workflows/security-gate.yml", r'''name: TEDVIO Security Gate

on:
  push:
    branches: [main]
    paths:
      - 'apps/teacher-v2/**'
      - 'supabase/migrations/**'
      - 'vercel.json'
      - '.github/workflows/security-gate.yml'
      - '.github/workflows/codeql.yml'
      - '.github/dependabot.yml'
      - 'SECURITY.md'
      - 'OPERATIONS-RECOVERY.md'
      - 'GITHUB-PROTECTION.md'
      - 'LICENSE'
      - 'NOTICE.md'
  pull_request:
    branches: [main]
    paths:
      - 'apps/teacher-v2/**'
      - 'supabase/migrations/**'
      - 'vercel.json'
      - '.github/workflows/security-gate.yml'
      - '.github/workflows/codeql.yml'
      - '.github/dependabot.yml'
      - 'SECURITY.md'
      - 'OPERATIONS-RECOVERY.md'
      - 'GITHUB-PROTECTION.md'
      - 'LICENSE'
      - 'NOTICE.md'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: tedvio-security-${{ github.ref }}
  cancel-in-progress: true

jobs:
  source-security:
    name: source-security
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: apps/teacher-v2/package-lock.json
      - name: Install pinned dependencies
        working-directory: apps/teacher-v2
        run: npm ci --no-audit --no-fund
      - name: TypeScript and security architecture
        working-directory: apps/teacher-v2
        run: |
          npm run typecheck
          npm run test:security
      - name: Production dependency audit
        working-directory: apps/teacher-v2
        run: npm audit --omit=dev --audit-level=high
      - name: Critical full-tree dependency audit
        working-directory: apps/teacher-v2
        run: npm audit --audit-level=critical

  dependency-review:
    name: dependency-review
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/dependency-review-action@v4
        with:
          fail-on-severity: high
          deny-licenses: AGPL-1.0-only, AGPL-1.0-or-later, SSPL-1.0
''')

write(".github/workflows/codeql.yml", r'''name: TEDVIO CodeQL

on:
  push:
    branches: [main]
    paths:
      - 'apps/teacher-v2/**'
      - '.github/workflows/codeql.yml'
  pull_request:
    branches: [main]
    paths:
      - 'apps/teacher-v2/**'
      - '.github/workflows/codeql.yml'
  schedule:
    - cron: '37 8 * * 2'
  workflow_dispatch:

permissions:
  security-events: write
  packages: read
  actions: read
  contents: read

concurrency:
  group: tedvio-codeql-${{ github.ref }}
  cancel-in-progress: true

jobs:
  analyze:
    name: Analyze (javascript-typescript)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v4
        with:
          languages: javascript-typescript
          queries: security-extended
      - uses: github/codeql-action/analyze@v4
        with:
          category: '/language:javascript-typescript'
''')

write(".github/dependabot.yml", r'''version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/apps/teacher-v2"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "08:30"
      timezone: "America/Mazatlan"
    open-pull-requests-limit: 5
    versioning-strategy: "increase-if-necessary"
    groups:
      teacher-runtime:
        dependency-type: "production"
      teacher-tooling:
        dependency-type: "development"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "08:45"
      timezone: "America/Mazatlan"
    open-pull-requests-limit: 5
''')

write("LICENSE", r'''TEDVIO PROPRIETARY LICENSE

Copyright © 2026 Raúl Daniel Ascencio Lugo. All Rights Reserved.

The source code, compiled software, visual identity, database design, documentation,
workflows, algorithms, educational models, and all associated materials in this
repository are proprietary and confidential intellectual property of the copyright
holder, except for third-party components used under their respective licenses.

No permission is granted to copy, reproduce, modify, publish, distribute, sublicense,
sell, host, reverse engineer, create derivative works from, or commercially exploit
this repository or any substantial portion of it without prior written authorization
from the copyright holder.

Access to the repository, including public visibility of any revision, does not grant
an open-source license or any implied right of use. Evaluation, testing, collaboration,
or deployment is allowed only when expressly authorized and only for the approved
TEDVIO purpose.

The TEDVIO name, logo, product identity, screenshots, and related marks may not be used
without prior written authorization.

THE SOFTWARE IS PROVIDED "AS IS" TO AUTHORIZED USERS, WITHOUT WARRANTY OF ANY KIND,
TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW.
''')

write("NOTICE.md", r'''# TEDVIO · Aviso de propiedad intelectual

TEDVIO es un producto de software propietario. La visibilidad del repositorio se mantiene actualmente por razones operativas de integración y despliegue; no constituye autorización de reutilización.

## Titularidad

Copyright © 2026 Raúl Daniel Ascencio Lugo. Todos los derechos reservados.

La marca, identidad visual, experiencia del producto, código propio, modelos de datos, migraciones, documentación y procesos operativos están sujetos a la licencia propietaria incluida en `LICENSE`.

## Componentes de terceros

Las dependencias instaladas mediante npm, GitHub Actions, Supabase y Vercel conservan sus licencias y condiciones respectivas. La licencia propietaria de TEDVIO no sustituye ni limita esas licencias.

## Colaboración autorizada

Toda colaboración debe realizarse mediante una rama y un pull request autorizado. No se permite publicar clones, bifurcaciones comerciales, demostraciones públicas ni despliegues derivados sin autorización escrita.
''')

write("SECURITY.md", r'''# Política de seguridad de TEDVIO

## Versiones con soporte

La versión desplegada desde `main` y el rollback disponible en `/teacher-legacy` reciben atención de seguridad durante el piloto. Las ramas históricas no deben utilizarse como entornos de producción.

## Reportar una vulnerabilidad

Dentro de TEDVIO, utiliza **Soporte → Reportar un problema** y selecciona la categoría adecuada. El sistema generará una referencia con el formato `TV-YYYYMMDD-XXXXXX`.

Incluye únicamente la referencia, ruta afectada, pasos mínimos, impacto, navegador y dispositivo. No adjuntes nombres de estudiantes, matrículas, respuestas, calificaciones, listas, contraseñas, enlaces de recuperación, tokens, cookies ni fotografías de documentos académicos.

Cuando no sea posible entrar a TEDVIO, abre un issue sin publicar detalles técnicos sensibles y solicita un canal privado de seguimiento. No publiques una prueba explotable antes de recibir confirmación.

## Tiempos objetivo

- Acuse de recibo: hasta 2 días hábiles.
- Clasificación inicial: hasta 5 días hábiles.
- Mitigación crítica: objetivo de 24 horas después de validación.
- Corrección alta: objetivo de 7 días naturales.

## Divulgación responsable

Se solicita un plazo razonable para validar, corregir y desplegar antes de cualquier divulgación.

## Alcance

Incluye autenticación, recuperación, RLS, exposición académica, privilegios, ejecución no autorizada, OMR, asistencia, calificaciones, reportes y secretos comprometidos. Excluye pruebas destructivas, ingeniería social, denegación de servicio, correo masivo y ataques a terceros sin autorización.
''')

write("OPERATIONS-RECOVERY.md", r'''# TEDVIO · Respaldo, restauración y rollback

## Objetivo

Este procedimiento protege la continuidad de TEDVIO ante una falla de frontend, migración defectuosa, pérdida de configuración o incidente de seguridad. No sustituye los respaldos contratados con Supabase o Vercel.

## Objetivos operativos

| Componente | RPO objetivo | RTO objetivo |
|---|---:|---:|
| Frontend y configuración versionada | 0 | 30 minutos |
| Base de datos académica | 24 horas durante piloto | 4 horas |
| Autenticación y documentos legales | 24 horas durante piloto | 4 horas |
| Archivos de Storage | 24 horas durante piloto | 8 horas |

RPO es la pérdida máxima de datos que el plan busca tolerar. RTO es el tiempo objetivo de recuperación.

## Inventario

- GitHub y SHA desplegado en `main`.
- Fuente `apps/teacher-v2` y artefacto reproducible `teacher-v2`.
- Historial de Vercel.
- Migraciones en `supabase/migrations`.
- Supabase `ggjknixnrjzkzkpwbwsl`.
- Rollback `/teacher-legacy`.

## Antes de un cambio de alto riesgo

1. Confirmar TypeScript, Security Gate, arquitectura y navegador.
2. Registrar SHA de producción.
3. Revisar salud y asesores de Supabase.
4. Para una migración destructiva, preparar reversión o copia lógica verificable.
5. No ejecutar `drop`, `truncate` o reescritura masiva sin ventana y verificación.
6. No guardar respaldos académicos en repositorios o servicios no autorizados.

## Base de datos

El plan actual de Supabase es Free. La retención de respaldos administrados depende del plan y debe confirmarse en el panel. Mientras permanezca en Free se conservan migraciones completas, se cifra cualquier exportación administrativa y no se confunde una copia de esquema con un respaldo de datos.

Para restaurar: congelar escrituras si es necesario, identificar respaldo y SHA compatibles, restaurar primero en un proyecto aislado, verificar conteos/RLS/funciones y promover únicamente después de aprobación.

## Rollback del frontend

La recuperación inmediata usa `/teacher-legacy`. Para rollback en Vercel se promueve un despliegue anterior de SHA conocido, se comprueban rutas y se mantiene abierto el incidente. Para Git se crea una rama, se revierte sin force push, se validan checks y se fusiona por PR.

## Migraciones

Una migración aplicada no se edita. Se repara mediante otra migración. Se prefiere evolución aditiva, evidencia histórica, ausencia de borrado físico y pruebas con `ROLLBACK`.

## Simulacro trimestral

Registrar fecha, participantes, SHAs, disponibilidad de rollback, restauración aislada, prueba transaccional, RLS, tiempos reales y acciones correctivas.
''')

write("GITHUB-PROTECTION.md", r'''# TEDVIO · Protección requerida para `main`

## Estado

La regla debe activarse en **Settings → Rules → Rulesets** por una persona con permisos administrativos. Este documento define la configuración aprobada; no afirma que ya esté activa.

## Ruleset recomendado

Nombre: `TEDVIO production main`

Destino: `refs/heads/main`

Controles: requerir PR, una aprobación, descartar aprobaciones obsoletas, resolver conversaciones, impedir force push/eliminación, exigir rama actualizada y restringir bypass.

## Checks requeridos

```text
TEDVIO 2.0 Frontend Build / quality
TEDVIO Security Gate / source-security
TEDVIO Security Gate / dependency-review
TEDVIO CodeQL / Analyze (javascript-typescript)
TEDVIO 2.0 Phase 6 Production Cutover / static-cutover
TEDVIO 2.0 Phase 6 Production Cutover / browser-cutover
```

## Excepción del artefacto

El workflow publica `teacher-v2` desde `github-actions[bot]`. Si el ruleset lo impide, conceder bypass exclusivamente a GitHub Actions o migrar el build a Vercel. Nunca usar bypass genérico o token personal.

## Verificación

Probar rechazo de actualización directa, PR con checks, publicación del bot, despliegue solo desde `main` y guardar evidencia administrativa.
''')

write("README.md", r'''# TEDVIO

TEDVIO es una plataforma propietaria para gestión docente, operación de clases, asistencia, evaluaciones, OMR, calificaciones, seguimiento académico y reportes.

## Producción

- Frontend canónico: `/teacher`
- Recuperación temporal: `/teacher-legacy`
- Fuente React/TypeScript: `apps/teacher-v2`
- Artefacto reproducible: `teacher-v2`
- Base de datos y autenticación: Supabase
- Despliegue: Vercel desde `main`

GitHub Actions utiliza Node 22, ejecuta TypeScript, auditorías arquitectónicas, Security Gate y build de producción. Después publica el artefacto estático reproducible que Vercel despliega.

## Seguridad

La versión vigente incluye recuperación de contraseña, reenvío de confirmación, callbacks separados del HashRouter, política fuerte, aceptación legal versionada, gate obligatorio, CSP aplicada, CodeQL, Dependabot y auditoría de dependencias.

Consulta `SECURITY.md`, `OPERATIONS-RECOVERY.md`, `GITHUB-PROTECTION.md` y `SECURITY_V67.md`.

## Desarrollo

```bash
cd apps/teacher-v2
npm ci
npm run quality
npm run dev
```

No agregues secretos, claves privadas, tokens de servicio ni datos académicos al repositorio.

## Licencia

TEDVIO no es software de código abierto. La visibilidad del repositorio no concede derechos de uso, copia, modificación o distribución. Consulta `LICENSE` y `NOTICE.md`.
''')

write("vercel.json", r'''{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "buildCommand": "",
  "installCommand": "",
  "outputDirectory": ".",
  "git": { "deploymentEnabled": { "main": true, "*": false } },
  "rewrites": [
    { "source": "/teacher", "destination": "/teacher-v2/index.html" },
    { "source": "/teacher/", "destination": "/teacher-v2/index.html" },
    { "source": "/auth/confirm", "destination": "/teacher-v2/index.html" },
    { "source": "/auth/confirm/", "destination": "/teacher-v2/index.html" },
    { "source": "/auth/recovery", "destination": "/teacher-v2/index.html" },
    { "source": "/auth/recovery/", "destination": "/teacher-v2/index.html" },
    { "source": "/teacher-legacy", "destination": "/teacher.html" },
    { "source": "/teacher-legacy/", "destination": "/teacher.html" },
    { "source": "/student", "destination": "/student.html" },
    { "source": "/student/", "destination": "/student.html" },
    { "source": "/admin", "destination": "/admin.html" },
    { "source": "/admin/", "destination": "/admin.html" },
    { "source": "/class", "destination": "/class.html" },
    { "source": "/class/", "destination": "/class.html" },
    { "source": "/display", "destination": "/display.html" },
    { "source": "/display/", "destination": "/display.html" },
    { "source": "/live", "destination": "/class.html" },
    { "source": "/live/", "destination": "/class.html" },
    { "source": "/join", "destination": "/student.html" },
    { "source": "/join/", "destination": "/student.html" },
    { "source": "/teacher-v2", "destination": "/teacher-v2/index.html" },
    { "source": "/teacher-v2/", "destination": "/teacher-v2/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains" },
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" }
      ]
    },
    {
      "source": "/teacher",
      "headers": [
        { "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://ggjknixnrjzkzkpwbwsl.supabase.co; font-src 'self' data:; connect-src 'self' https://ggjknixnrjzkzkpwbwsl.supabase.co wss://ggjknixnrjzkzkpwbwsl.supabase.co; worker-src 'self' blob:; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests" }
      ]
    },
    {
      "source": "/teacher/",
      "headers": [
        { "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://ggjknixnrjzkzkpwbwsl.supabase.co; font-src 'self' data:; connect-src 'self' https://ggjknixnrjzkzkpwbwsl.supabase.co wss://ggjknixnrjzkzkpwbwsl.supabase.co; worker-src 'self' blob:; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests" }
      ]
    },
    {
      "source": "/teacher-v2/index.html",
      "headers": [
        { "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://ggjknixnrjzkzkpwbwsl.supabase.co; font-src 'self' data:; connect-src 'self' https://ggjknixnrjzkzkpwbwsl.supabase.co wss://ggjknixnrjzkzkpwbwsl.supabase.co; worker-src 'self' blob:; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests" }
      ]
    },
    {
      "source": "/auth/confirm",
      "headers": [
        { "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://ggjknixnrjzkzkpwbwsl.supabase.co; font-src 'self' data:; connect-src 'self' https://ggjknixnrjzkzkpwbwsl.supabase.co wss://ggjknixnrjzkzkpwbwsl.supabase.co; worker-src 'self' blob:; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests" }
      ]
    },
    {
      "source": "/auth/recovery",
      "headers": [
        { "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://ggjknixnrjzkzkpwbwsl.supabase.co; font-src 'self' data:; connect-src 'self' https://ggjknixnrjzkzkpwbwsl.supabase.co wss://ggjknixnrjzkzkpwbwsl.supabase.co; worker-src 'self' blob:; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests" }
      ]
    },
    { "source": "/", "headers": [{ "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" }] },
    { "source": "/index.html", "headers": [{ "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" }] },
    { "source": "/beta.html", "headers": [{ "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" }] },
    { "source": "/teacher.html", "headers": [{ "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" }] },
    { "source": "/teacher-legacy", "headers": [{ "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" }] },
    { "source": "/teacher-legacy/", "headers": [{ "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" }] },
    { "source": "/teacher-v2", "headers": [{ "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" }] },
    { "source": "/teacher-v2/", "headers": [{ "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" }] },
    { "source": "/teacher-v2/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" }, { "key": "Service-Worker-Allowed", "value": "/" }] },
    { "source": "/version.json", "headers": [{ "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" }] },
    { "source": "/manifest.webmanifest", "headers": [{ "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" }] }
  ]
}
''')

settings_path = ROOT / "apps/teacher-v2/src/core/settings.ts"
settings = settings_path.read_text(encoding="utf-8")
if "from './auth-security'" not in settings:
    settings = settings.replace(
        "import type { User } from '@supabase/supabase-js';\n",
        "import type { User } from '@supabase/supabase-js';\nimport { assertStrongPassword, authErrorMessage } from './auth-security';\n",
        1,
    )
settings, count = re.subn(
    r"export async function changePassword\(password: string\): Promise<void> \{.*?\n\}",
    """export async function changePassword(password: string): Promise<void> {\n  assertStrongPassword(password);\n  const { error } = await supabase.auth.updateUser({ password });\n  if (error) throw new Error(authErrorMessage(error, 'update-password'));\n}""",
    settings,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError("No se encontró changePassword en settings.ts")
settings_path.write_text(settings, encoding="utf-8")

write("apps/teacher-v2/scripts/security-check.mjs", r'''import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const sourceRoot = path.join(root, 'apps/teacher-v2/src');
const errors = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}
function must(condition, message) {
  if (condition) console.log(`OK   ${message}`);
  else { errors.push(message); console.error(`FAIL ${message}`); }
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const authProvider = read('apps/teacher-v2/src/features/auth/AuthProvider.tsx');
const login = read('apps/teacher-v2/src/features/auth/LoginPage.tsx');
const callback = read('apps/teacher-v2/src/features/auth/AuthCallbackPage.tsx');
const gate = read('apps/teacher-v2/src/features/auth/LegalConsentGate.tsx');
const securityCore = read('apps/teacher-v2/src/core/auth-security.ts');
const app = read('apps/teacher-v2/src/app/App.tsx');
const packageJson = JSON.parse(read('apps/teacher-v2/package.json'));
const vercel = JSON.parse(read('vercel.json'));
const foundationMigration = read('supabase/migrations/20260831090000_tedvio_access_security_foundation_v21.sql');
const acceptanceMigration = read('supabase/migrations/20260831090100_tedvio_required_legal_acceptance_v21.sql');
const enforcementMigration = read('supabase/migrations/20260831100000_tedvio_access_security_enforcement_v21.sql');
const license = read('LICENSE');
const operations = read('OPERATIONS-RECOVERY.md');
const securityPolicy = read('SECURITY.md');
const protection = read('GITHUB-PROTECTION.md');
const securityWorkflow = read('.github/workflows/security-gate.yml');
const codeqlWorkflow = read('.github/workflows/codeql.yml');
const dependabot = read('.github/dependabot.yml');

must(authProvider.includes('resetPasswordForEmail'), 'Auth implementa solicitud de recuperación');
must(authProvider.includes("auth.resend") && authProvider.includes("type: 'signup'"), 'Auth implementa reenvío de confirmación');
must(authProvider.includes('PASSWORD_RECOVERY') && authProvider.includes('updateRecoveredPassword'), 'Auth distingue una sesión real de recuperación');
must(authProvider.includes('tedvio_legal_acceptances') && authProvider.includes('tedvio_signup_source'), 'Alta adjunta aceptaciones legales versionadas');
must(securityCore.includes('PASSWORD_MIN_LENGTH = 12') && securityCore.includes('notCommon'), 'Política de contraseña exige 12 caracteres y bloquea patrones comunes');
must(securityCore.includes('authErrorMessage') && !login.includes('error_description'), 'Interfaz no expone mensajes internos de autenticación');
must(login.includes("'recover'") && login.includes("'resend'") && login.includes('Olvidé mi contraseña'), 'Acceso ofrece recuperación y reenvío');
must(login.includes('auth-honeypot') && login.includes('remainingAuthCooldown'), 'Formularios incorporan señuelo y enfriamiento local');
must(login.includes('legal-consent-list') && login.includes('legalAcceptancePayload'), 'Alta exige aceptación explícita de cada documento');
must(callback.includes('recoveryMode') && callback.includes('Guardar nueva contraseña'), 'Callback de recuperación no se confunde con una sesión normal');
must(gate.includes('acceptRequiredLegalDocuments'), 'Cuenta autenticada queda bloqueada hasta aceptar documentos vigentes');
must(app.includes("physicalPath === '/auth/confirm'") && app.includes("physicalPath === '/auth/recovery'"), 'Callbacks de Auth tienen rutas físicas independientes del HashRouter');

const reportOnlyHeaders = (vercel.headers || []).flatMap((entry) => entry.headers || []).filter((header) => header.key === 'Content-Security-Policy-Report-Only');
const canonicalHeaderEntries = (vercel.headers || []).filter((entry) => ['/teacher', '/teacher/', '/teacher-v2/index.html', '/auth/confirm', '/auth/recovery'].includes(entry.source));
const canonicalPolicies = canonicalHeaderEntries.map((entry) => (entry.headers || []).find((header) => header.key === 'Content-Security-Policy')?.value || '');
must(reportOnlyHeaders.length === 0, 'CSP report-only fue retirada');
must(canonicalPolicies.length === 5 && canonicalPolicies.every(Boolean), 'CSP aplicada cubre shell y callbacks canónicos');
must(canonicalPolicies.every((policy) => policy.includes("script-src 'self'") && policy.includes("frame-ancestors 'none'") && policy.includes("object-src 'none'")), 'CSP bloquea scripts externos, iframes y objetos');
must(canonicalPolicies.every((policy) => policy.includes('ggjknixnrjzkzkpwbwsl.supabase.co')), 'CSP permite únicamente el proyecto Supabase de TEDVIO');
must((vercel.rewrites || []).some((entry) => entry.source === '/auth/recovery' && entry.destination === '/teacher-v2/index.html'), 'Vercel sirve el callback de recuperación');
must((vercel.rewrites || []).some((entry) => entry.source === '/auth/confirm' && entry.destination === '/teacher-v2/index.html'), 'Vercel sirve el callback de confirmación');

must(foundationMigration.includes('tedvio_required_legal_documents_v21') && foundationMigration.includes('tedvio_capture_signup_legal_consents_v21'), 'Migración publica documentos y captura consentimientos');
must(acceptanceMigration.includes('tedvio_accept_required_legal_v21'), 'Aceptación posterior se guarda de forma atómica');
must(enforcementMigration.includes('LEGAL_ACCEPTANCE_REQUIRED') && !enforcementMigration.includes('Legacy omission is temporarily tolerated'), 'Migración final rechaza altas sin aceptación');
must(foundationMigration.includes('security definer') && foundationMigration.includes('revoke all'), 'RPC preautenticado conserva privilegios mínimos');

must(packageJson.scripts?.['test:security'] === 'node scripts/security-check.mjs', 'package.json expone auditoría de seguridad');
must(packageJson.scripts?.quality?.includes('npm run test:security'), 'build exige la auditoría de seguridad');
must(securityWorkflow.includes('npm audit --omit=dev --audit-level=high') && securityWorkflow.includes('npm run test:security'), 'CI rechaza vulnerabilidades altas de producción');
must(codeqlWorkflow.includes('github/codeql-action') && codeqlWorkflow.includes('javascript-typescript'), 'CodeQL analiza JavaScript y TypeScript');
must(dependabot.includes('package-ecosystem: "npm"') && dependabot.includes('package-ecosystem: "github-actions"'), 'Dependabot cubre dependencias y Actions');

must(/All Rights Reserved/i.test(license) && /No permission/i.test(license), 'Licencia propietaria define propiedad intelectual');
must(operations.includes('RPO') && operations.includes('RTO') && operations.includes('/teacher-legacy'), 'Plan operativo documenta respaldo y rollback');
must(securityPolicy.includes('Reportar un problema') && securityPolicy.includes('TV-YYYYMMDD'), 'Política de seguridad define canal responsable');
must(protection.includes('TEDVIO Security Gate / source-security') && protection.includes('github-actions[bot]'), 'Guía de protección documenta checks y bot');

const sourceFiles = walk(sourceRoot).filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));
const secretPatterns = [
  ['clave privada', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub PAT clásico', /ghp_[A-Za-z0-9]{30,}/],
  ['GitHub PAT granular', /github_pat_[A-Za-z0-9_]{40,}/],
  ['clave secreta Supabase', /sb_secret_[A-Za-z0-9_-]{20,}/],
  ['clave OpenAI', /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ['service role en frontend', /service_role/i],
  ['token JWT incrustado', /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/],
];
for (const file of sourceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const [name, pattern] of secretPatterns) {
    must(!pattern.test(content), `${name} ausente en ${path.relative(sourceRoot, file)}`);
  }
}

if (errors.length) {
  console.error(`\n${errors.length} control(es) de seguridad fallaron.`);
  process.exit(1);
}
console.log('\nTEDVIO 2.1 access and security check passed.');
''')

# The workflow removes these temporary bootstrap files before committing the result.
