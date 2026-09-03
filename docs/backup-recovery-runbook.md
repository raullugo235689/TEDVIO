# Respaldo y Recuperación 2.2

Este procedimiento protege la continuidad de TEDVIO sin utilizar datos académicos para pruebas destructivas. Los respaldos administrados se consultan en **Supabase Dashboard → Database → Backups**. La restauración sólo se autoriza después de identificar el incidente, conservar evidencia y definir el punto de recuperación.

## Objetivos operativos del piloto

- **RPO objetivo:** máximo 24 horas con respaldo diario; reducirlo si se habilita recuperación a un punto en el tiempo.
- **RTO objetivo:** 4 horas para diagnóstico, restauración aislada, verificación y decisión de conmutación. El tiempo real depende del tamaño de la base y del proveedor.
- **Retención mínima de evidencia:** 30 días para manifiestos de migraciones y resultados de los simulacros.

## Alcance real

El respaldo de PostgreSQL cubre esquema y registros de base de datos. El respaldo de base **no incluye los objetos binarios de Storage**: conserva metadatos, pero las imágenes o archivos deben tener una estrategia separada. Tampoco deben guardarse contraseñas, tokens o exportaciones con datos de estudiantes como artefactos de GitHub Actions.

## Comprobación mensual no destructiva

1. Confirmar que el proyecto TEDVIO aparece `ACTIVE_HEALTHY`.
2. Revisar en Dashboard la fecha del respaldo disponible más reciente y compararla con el RPO.
3. Ejecutar `TEDVIO Backup & Recovery Readiness` y conservar su manifiesto SHA-256.
4. Comparar el inventario remoto con los objetos críticos documentados por el contrato.
5. Registrar fecha, responsable, punto disponible, resultado y cualquier desviación.

## Simulacro trimestral de restauración

**Nunca restaurar sobre producción.** Crear o seleccionar un entorno aislado dedicado exclusivamente a recuperación y verificar por dos personas que su referencia no corresponde al proyecto productivo.

1. Elegir un respaldo anterior al punto del incidente simulado.
2. Restaurarlo en el entorno aislado mediante el Dashboard o el procedimiento oficial vigente de Supabase.
3. Restablecer secretos propios del entorno; nunca copiar tokens de producción a reportes.
4. Verificar `auth.users`, perfiles docentes y separación por RLS sin revelar correos en la evidencia.
5. Comprobar grupos, estudiantes, asistencia, banco de reactivos, evaluaciones, resultados OMR, periodos y calificaciones mediante conteos agregados.
6. Abrir una sesión sintética y validar Teacher, Student, Projection y Realtime.
7. Confirmar que exportaciones, cierres académicos y trazabilidad conservan integridad.
8. Destruir el entorno temporal conforme a la política acordada, una vez aprobada la evidencia.

## Criterios de aprobación

- El punto restaurado está dentro del RPO.
- El servicio vuelve dentro del RTO o queda documentada la causa de la desviación.
- Las migraciones tienen versiones únicas y huellas verificables.
- Los objetos críticos existen y las políticas RLS permanecen activas.
- Los conteos agregados coinciden con el respaldo; no se copian datos personales a la evidencia.
- Auth, RPC académicas y Realtime superan una microclase sintética completa.
- Se documenta por separado la recuperación de objetos de Storage.

## Evidencia mínima

Registrar: fecha UTC, incidente simulado, responsable, referencia del entorno aislado, punto recuperado, RPO observado, RTO observado, SHA del código, manifiesto de migraciones, controles aprobados, desviaciones, acciones correctivas y autorización de cierre. Nunca adjuntar contraseñas, cadenas de conexión, nombres, matrículas, respuestas o calificaciones.

## Escalamiento

Si no existe un respaldo dentro del RPO, falta Storage, falla una política RLS o los conteos no coinciden, no se conmuta el servicio. Se mantiene producción en modo seguro, se conserva evidencia y se escala al propietario antes de cualquier restauración.
