# TEDVIO

**Todo tu trabajo docente, en un solo lugar.**

TEDVIO conecta grupos, asistencia, clase interactiva, evaluación, OMR, calificaciones y seguimiento académico mediante una aplicación web docente unificada.

## Producto

- Agenda y grupos.
- Asistencia Pro.
- Modo Clase y proyección.
- Question Studio.
- Evaluaciones impresas y versiones.
- Captura OMR con revisión docente.
- Libro de calificaciones.
- Alumno 360°.
- Periodos, reportes y configuración.
- Recuperación de acceso, consentimiento legal y soporte técnico.

## Acceso

Producción docente: `https://tedvio.vercel.app/teacher`

La versión anterior se conserva temporalmente en `/teacher-legacy` como mecanismo de recuperación durante el piloto.

## Alcance de lanzamiento

La definición contractual del producto se encuentra en [`PRODUCT-SCOPE-1.0.md`](PRODUCT-SCOPE-1.0.md). Tareas/Assignments no forma parte de la promesa comercial 1.0 y se evaluará para una versión posterior.

## Arquitectura

- React + TypeScript + Vite.
- Supabase Auth, PostgreSQL, RLS y Realtime.
- Vercel para distribución del frontend.
- Un solo `AppShell`, router y cliente Supabase.
- Sin IA generativa obligatoria ni costo por tokens.

## Seguridad y operación

- Política local de contraseñas fuertes.
- Recuperación y confirmación mediante enlaces de un solo uso.
- Consentimientos legales versionados.
- Content Security Policy aplicada.
- Auditorías de arquitectura, seguridad y build reproducible.
- Reliability Core, soporte dentro del producto y códigos de incidente.

La protección administrativa requerida para `main` está documentada en [`GITHUB-PRODUCTION-PROTECTION.md`](GITHUB-PRODUCTION-PROTECTION.md).

## Estado

Producto funcional en preparación para piloto docente controlado. La apertura comercial depende de pruebas autenticadas reproducibles, onboarding medible y validación con profesores externos.
