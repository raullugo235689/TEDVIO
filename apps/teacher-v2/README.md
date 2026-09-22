# TEDVIO 2.0 · Teacher Frontend

Reconstrucción paralela del espacio docente con **Vite + React + TypeScript**.

## Alcance de la fase 1

- autenticación con el proyecto Supabase existente;
- un solo cliente Supabase;
- shell persistente;
- router único;
- tema claro/oscuro;
- Inicio funcional con datos reales;
- Agenda de solo lectura;
- Grupos de solo lectura;
- puentes explícitos a TEDVIO actual para operaciones todavía no migradas.

## Principios

- no se modifica el backend ni se duplican datos;
- no se usa `innerHTML`, `MutationObserver` global ni handlers inline;
- no se introduce IA generativa;
- no se publican módulos incompletos como terminados;
- el build estático se genera en `/teacher-v2/`.

## Desarrollo

```bash
npm install
npm run quality
npm run dev
```

La aplicación lee `window.TEDVIO_CONFIG` desde `/config.js`, igual que la plataforma actual.

## Espacio docente · septiembre 2026

La navegación se organiza en cinco áreas, manteniendo todas las rutas anteriores:

| Área | Herramientas |
| --- | --- |
| Inicio | Resumen, accesos rápidos y Agenda |
| Mis grupos | Asistencia, Modo Clase, Calificaciones, Perfil del alumno y Periodos |
| Preguntas y exámenes (`/prepare`) | Banco de preguntas, creación de exámenes, evaluaciones y Calificar hojas |
| Reportes | Reportes y Analítica |
| Configuración | Preferencias y cuenta |

`app/navigation.tsx` es la fuente compartida para escritorio y móvil. Los submenús
se abren automáticamente en el área actual; el menú móvil usa un diálogo nativo
con cierre por Escape y restitución de foco. La navegación conserva las guardas de
borradores, los permisos y los enlaces con contexto de grupo.

El Inicio sigue usando `useTeacherHome`, sin duplicar consultas ni inventar métricas.
`workspace-premium.css` se limita a pantalla: no cambia la geometría de las hojas
de respuestas ni los cuadernillos impresos. No requiere migraciones, dependencias
nuevas ni servicios de pago.

Verificación: `npm run quality` y, desde la raíz del repositorio,
`npx playwright test --config=tests/browser/phase6-playwright.config.mjs`.
La suite `phase6-workspace.spec.mjs` usa datos sintéticos y cubre navegación,
teclado, contexto de grupo, temas, estados vacíos y anchuras de 320 a 1440 px.
El despliegue conserva `/teacher` y la ruta de recuperación `/teacher-legacy`.
