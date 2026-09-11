# TEDVIO · Estado de aceptación del issue #53

Fecha de verificación: 6 de septiembre de 2026. Base revisada: `main` después del PR #83 y proyecto Supabase TEDVIO en estado saludable.

## Cubierto

- Recuperación de contraseña y reenvío de confirmación.
- Mensajes de autenticación, límites de espera, recuperación de sesión, detección de conectividad y mitigaciones básicas contra abuso.
- Aceptación explícita y versionada de términos y privacidad durante el alta, más compuerta para cuentas existentes.
- CSP aplicada, HSTS, callbacks sin caché y ruta de rollback del frontend.
- Security Gate con detección de secretos, auditoría de dependencias y contrato de seguridad; Dependabot configurado.
- Licencia propietaria y política de divulgación responsable.
- Respaldo, restauración, esquema fundacional y simulacro aislado incorporados por los PR #78, #79 y #80.
- Supabase Security Advisor sin hallazgos críticos ni altos al corte.

## Incluido en este bloque

- Consolidación de las políticas RLS duplicadas de `v2_grade_categories` y `v2_grade_items`.
- Separación explícita de SELECT, INSERT, UPDATE y DELETE sin la política permisiva `ALL` heredada.
- Cierre de una validación débil que permitía asociar un ítem con una categoría de otro grupo durante ciertas actualizaciones.
- Revisión de índices con estadísticas reales: las rutas canónicas activas ya están cubiertas; los avisos restantes corresponden a tablas heredadas o alternativas vacías y no justifican índices nuevos todavía.

## Pendiente externo

- Activar Leaked Password Protection en Supabase. Es la única advertencia del Security Advisor y depende de la capacidad disponible en el plan.
- Activar en GitHub la protección efectiva de `main`: la API devolvió cero rulesets del repositorio; todavía deben exigirse PR, aprobación, conversaciones resueltas y checks requeridos. La protección clásica no pudo verificarse con los permisos de la integración.
- Mantener conscientemente el repositorio público con licencia propietaria o cambiarlo a privado antes de la comercialización amplia.
- Aplicar esta migración mediante PR y volver a ejecutar los asesores de seguridad y rendimiento.

## Índices diferidos con intención

Los asesores señalan claves foráneas sin índice en tablas heredadas o alternativas todavía vacías. No se agregan en esta entrega para evitar índices especulativos, penalización de escrituras y nuevas advertencias de índices sin uso. Se revisarán después del piloto ampliado con `pg_stat_statements`, conteos reales y planes de las consultas dominantes.
