# TEDVIO v72 · Academic Workflow

## Objetivo

Convertir el flujo docente central en una ruta continua y accionable: **preparar → dar clase → cerrar el ciclo académico**, sin crear un LMS paralelo ni aumentar el número de recursos de la primera carga.

## Implementación

### Inicio docente

- Ruta académica de hoy con tres etapas: preparar, dar clase y cerrar ciclo.
- Bloque “Continuar donde lo dejaste” basado en el último grupo abierto.
- Pendientes de hoy para asistencia activa, grupos sin lista y seguimiento académico.
- Reutiliza los datos ya entregados por `v2_teacher_today_dashboard`; no duplica el RPC ni agrega consultas al primer render.
- Se integra dentro de `teacher-command-center-v70.js/css`, conservando el mismo número de recursos iniciales y renovando su clave de caché a `v=72`.

### Centro de grupo

- Progreso de ponderación con evidencia.
- Porcentaje de captura completa y cantidad de celdas pendientes.
- Actividades manuales con captura incompleta y acceso directo a su captura.
- Lista de revisión previa al cierre, sin bloquear ni cerrar irreversiblemente el libro.

### Alumno 360°

- Evidencias manuales capturadas y pendientes.
- Acceso directo a la primera evidencia faltante.
- Simulador de próxima calificación por categoría, claramente identificado como una proyección que no guarda cambios.

## Arquitectura y seguridad

- El módulo de grupo se carga únicamente al abrir **Grupos**.
- Reutiliza el cliente autenticado `__TEDVIO_TEACHER686__`.
- Todas las lecturas nuevas se restringen por `teacher_id` y `group_id`.
- No se agregaron tablas, funciones, migraciones, claves privilegiadas, polling ni observadores de DOM.
- La lectura de calificaciones se pagina para evitar truncamientos en libros grandes.

## Validación

- Auditoría propia v72.
- Regresiones de v70, v71, tema claro/oscuro, compatibilidad móvil, carga diferida, Teacher Core e iOS/Safari.
- Verificación de sintaxis y `git diff --check` antes del despliegue.
