# TEDVIO v67 · Security & Commercial Readiness

## Controles aplicados

- La lógica privilegiada de los RPC del aula vive en `tedvio_private`; los nombres públicos conservan compatibilidad mediante wrappers `SECURITY INVOKER`.
- Los RPC docentes sensibles no son ejecutables por `anon`.
- Los endpoints públicos de clase, asistencia y Assignments tienen rate limiting con fingerprint SHA-256; no se almacena la IP cruda en la tabla de límites.
- `v2_submit_response` califica en servidor, pero no devuelve corrección, puntos ni streak antes del reveal.
- `v2_student_answer_result` libera el resultado individual únicamente cuando la pregunta fue revelada o la sesión cerró.
- Ranking y feedback individual omiten preguntas todavía no reveladas durante una sesión activa.
- `roster_student_id` usa el roster canónico `v2_group_students` en participantes y asistencia.
- Las tablas legacy/quarantined tienen políticas RLS de denegación explícita.
- El Centro de ayuda usa `tedvio_support_reports` con RLS por propietario y acceso administrativo.
- La web publica HSTS, `nosniff`, Referrer Policy, protección de frame y Permissions Policy. La CSP inicia en `Report-Only` para observar compatibilidad antes de hacerla obligatoria.

## Verificación realizada

Se probaron transaccionalmente y con rollback: respuesta correcta durante estado `live`, liberación de resultado después de `revealed`, ranking/feedback pre y post reveal, rate limiting, y matrícula → participante → roster → asistencia.

## Pendientes administrativos externos

- Activar **Leaked Password Protection** en Supabase Auth cuando la configuración administrativa esté disponible.
- Evaluar cambiar el repositorio a privado antes de una comercialización amplia.
