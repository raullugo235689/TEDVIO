# Eliminación académica segura

## Alcance

La interfaz docente incorpora **Eliminar** en Banco, Centro de grupos, Modo Clase y Estructura académica (instituciones y programas). No es una papelera ni una eliminación masiva.

| Registro | Se permite cuando | Se conserva / bloquea |
| --- | --- | --- |
| Pregunta del banco | No tiene referencias | Sesiones, cuestionarios, tareas y exámenes vinculados bloquean; «Archivar» sigue disponible |
| Grupo | No tiene registros dependientes | Alumnos, asistencia, evaluaciones, periodos, horarios y otras referencias bloquean |
| Sesión | No está en vivo ni tiene dependencias protegidas | Elimina sus preguntas y claves; conserva el banco original. Participantes, respuestas, recibos, telemetría y pruebas previas bloquean |
| Programa | No tiene grupos ni otras referencias | No elimina grupos en cascada |
| Institución | No tiene programas ni otras referencias | No elimina programas en cascada |

Las dependencias se identifican mediante todas las claves foráneas entrantes del catálogo PostgreSQL, incluidas las privadas y las que usan `CASCADE` o `SET NULL`. Solo se exceptúan las preguntas de la propia sesión y sus copias de claves. También se comprueba que otra sesión no apunte a esas preguntas. Esta protección no descubre vínculos arbitrarios dentro de JSON o UUID sin FK: futuras relaciones académicas deben declararse con FK o ampliar la validación.

## Contrato y seguridad

- `v2_academic_delete(p_kind, p_id, p_expected_version = null)` hace una revisión sin borrar cuando la versión es nula.
- Confirmar exige el mismo identificador, tipo y versión revisados. La UI requiere escribir `ELIMINAR`.
- El servidor deriva el propietario de `auth.uid()`, usa una lista cerrada de tablas y vuelve a bloquear y comprobar el registro y sus preguntas dentro de la transacción.
- Las filas vinculadas por FK no pueden insertarse entre la comprobación final y el borrado; los conflictos de bloqueo fallan sin una eliminación parcial.
- No hay reintentos de escritura ni cola offline. Tras un error hay que volver a revisar. Un resultado sin confirmación explícita no muestra éxito.
- El wrapper público es `SECURITY INVOKER`; la implementación privada usa `SECURITY DEFINER` con `search_path` vacío y permisos acotados para comprobar dependencias ocultas por RLS. La función auxiliar no está concedida a clientes.
- El endpoint de eliminación de sesiones anterior reutiliza la misma validación. No se modifican permisos ni RLS de tablas. Otros accesos directos heredados no son reemplazados por este cambio.
- La confirmación invalida las consultas del docente, pero no elimina borradores académicos locales.

## Activación

1. Revisar y autorizar la publicación del cambio. No publicar datos privados, bancos ni credenciales en el repositorio.
2. Aplicar por el procedimiento autorizado la migración `supabase/migrations/20260914004911_safe_academic_deletion.sql` antes de desplegar la interfaz. Aplicar esta migración **no elimina registros**.
3. Desplegar el frontend docente compilado. Si falta la migración, el diálogo explica que el servidor aún no está actualizado y no intenta un DELETE alternativo.
4. Comprobar con registros sintéticos de una cuenta de prueba: revisión, cancelación, borrado vacío, bloqueo por referencias y aislamiento entre docentes. No usar alumnos ni clases reales para probar.

Revertir el frontend deja las funciones nuevas sin uso y mantiene la protección del endpoint anterior. No restaurar el endpoint antiguo que permitía cascadas sin revisión.

## Verificación

- `cd apps/teacher-v2 && npm ci && npm run quality`: incluye nueve pruebas de PostgreSQL en memoria (`PGlite`, dependencia solo de desarrollo), compilación y contratos de seguridad/arquitectura.
- `npx playwright test --config=tests/browser/phase6-playwright.config.mjs phase6-deletion`: seis escenarios configurados para escritorio Chromium y móvil WebKit con API y usuarios sintéticos.
- Las pruebas PostgreSQL usan un esquema mínimo con FKs/RLS equivalentes. No sustituyen un reset completo de las migraciones ni una prueba concurrente de varias conexiones.
- El workflow de recuperación existente puede comprobar el reset completo en un entorno Supabase aislado. No se aplica la migración automáticamente a producción desde estas pruebas.

### Resultado local (2026-09-14)

- Suite `quality` completa aprobada: 43 pruebas automatizadas, build y contratos de arquitectura, seguridad y recuperación.
- 12 recorridos de eliminación aprobados en Chromium (escritorio y móvil emulado), incluidos capturas visuales, foco y ausencia de errores de ejecución en Banco.
- 14 regresiones de asistencia, calificaciones, creador de exámenes y OMR aprobadas en Chromium de escritorio.
- WebKit y el reset completo Supabase no se ejecutaron localmente. La descarga estándar de navegadores falló; Chromium alternativo se utilizó solo como herramienta temporal, sin añadirlo a la aplicación.
- No se publicó el cambio ni se modificaron datos reales para estas comprobaciones.
