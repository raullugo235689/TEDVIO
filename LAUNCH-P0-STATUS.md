# TEDVIO 2.1 · Estado P0 de lanzamiento

Fecha de corte: 31 de agosto de 2026.

## Completado en esta entrega

- Privilegio mínimo para los RPC legales y eliminación de advertencias por `SECURITY DEFINER` expuesto.
- Lectura pública limitada a documentos legales publicados y requeridos.
- Acceso con recuperación de contraseña, reenvío de confirmación, contraseña robusta y consentimiento versionado.
- Onboarding docente de cinco pasos con progreso medible.
- Entorno demo aislado, reiniciable y excluido de reportes reales.
- Alcance comercial 1.0 congelado sin Tareas/Assignments.
- CSP aplicada, callbacks protegidos y contratos de caché compatibles con el rollback heredado.
- Auditoría P0 integrada al build.
- Especificación Playwright autenticada para escritorio y WebKit/iPhone.

## Validaciones externas todavía requeridas

- Configurar una cuenta sintética exclusiva y los secretos `TEDVIO_E2E_EMAIL` y `TEDVIO_E2E_PASSWORD` para ejecutar el recorrido autenticado.
- Activar protección de `main` y pull request obligatorio desde la administración de GitHub.
- Cambiar el repositorio a privado antes de una comercialización amplia, o mantener conscientemente la estrategia pública y propietaria.
- Habilitar protección de contraseñas filtradas cuando el plan de Supabase lo permita.
- Ejecutar el piloto con docentes externos antes de abrir pagos.

## Condición para el piloto

La rama puede fusionarse cuando las auditorías automáticas del commit final estén en verde. La apertura del piloto no equivale todavía al lanzamiento comercial masivo.
