# TEDVIO 2.0 · Frontend docente unificado

## Estado de la reconstrucción

TEDVIO 2.0 conserva Supabase, RLS, tablas, RPC y datos académicos, pero sustituye el frontend docente acumulativo por una sola aplicación React + TypeScript + Vite.

## Fases cerradas

### Fase 1 · Base unificada

- Un solo `AppShell`.
- Un solo router.
- Un solo cliente Supabase.
- Autenticación, Inicio y Agenda.

### Fase 2 · Grupos, alumnos y Asistencia Pro

- Institución → Programa → Grupo.
- Centro de grupo.
- Padrón protegido.
- Asistencia P/R/F/J.
- Apertura, pausa, cierre y reapertura.

### Fase 3 · Modo Clase y Question Studio

- Banco de Reactivos.
- Sesiones Live y Realtime.
- Lanzamiento, respuesta, revelado y cierre.
- Participación y notas docentes.

### Fase 4 · Evaluación académica integral

- Evaluaciones A/B/C.
- OMR local con revisión obligatoria.
- Libro de calificaciones.
- Alumno 360°.
- Evidencias, historial y trazabilidad.

### Fase 5 · Cierre, Reportes y Configuración

- Periodos académicos.
- Cierre con snapshot oficial.
- Reapertura con motivo.
- Centro de Reportes.
- Perfil, umbrales, institución, privacidad, seguridad y portabilidad.

### Fase 6 · Corte controlado a producción

- `/teacher` sirve el frontend unificado.
- `/teacher-v2/` permanece como alias técnico.
- `/teacher-legacy` conserva la versión anterior para rollback.
- PWA y confirmaciones de correo utilizan `/teacher`.
- Service worker renueva cachés antiguas sin recargar automáticamente.
- Error Boundary ofrece recuperación y acceso temporal al rollback.
- Auditoría en Chromium de escritorio y WebKit con viewport de iPhone.
- Shell canónico sin capas heredadas.
- Assets hashados con caché inmutable e índice con `no-store`.

## Rutas de producción

```text
/teacher          → TEDVIO 2.0 principal
/teacher-v2/      → alias técnico del mismo frontend
/teacher-legacy   → rollback temporal de la versión anterior
```

## Condiciones permanentes

- Sin `innerHTML` para reconstruir la aplicación.
- Sin `MutationObserver` global.
- Sin polling permanente.
- Sin un segundo cliente Supabase.
- Sin eliminación física de evidencia académica.
- Sin IA generativa ni costos de inferencia.
- Cada cambio debe pasar TypeScript, auditorías de arquitectura, build reproducible y pruebas de navegador.

## Siguiente ciclo

Después del corte de producción, el trabajo deja de organizarse como “migración por fases”. Las siguientes versiones se centrarán en:

1. piloto con profesores reales;
2. accesibilidad y rendimiento;
3. asistencia sin conexión;
4. onboarding medible;
5. respaldo, recuperación y papelera;
6. preparación comercial.
