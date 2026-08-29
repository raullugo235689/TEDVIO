# TEDVIO 2.0 · Frontend docente unificado

## Estrategia

La reconstrucción se realiza en paralelo y conserva producción en `/teacher`. La vista nueva vive en `/teacher-v2/` hasta completar la migración.

## Fase 1 · Base unificada

- React + TypeScript + Vite.
- Un solo `AppShell` persistente.
- Un solo router.
- Un solo cliente Supabase.
- Autenticación compatible con la sesión existente.
- Dashboard real mediante `v2_teacher_today_dashboard`.
- Agenda mediante `v2_group_schedule_slots`.
- Tema claro/oscuro y navegación móvil.
- Sin cambios de esquema, migraciones o RLS.

## Fase 2 · Grupos, alumnos y Asistencia Pro

- Estructura académica: institución → programa → grupo.
- Creación y edición de grupos.
- Centro de grupo con ruta React propia.
- Alta, edición, importación, desactivación y reactivación de alumnos.
- Historial reciente de asistencia.
- Creación de listas por fecha.
- Estados Presente, Retardo, Falta y Justificada.
- Observaciones individuales y nota general.
- Guardado, pausa, reanudación, cierre y reapertura.
- Navegación interna Inicio → Agenda → Grupo → Asistencia.
- Sin eliminar registros históricos ni duplicar datos.

## Próximas fases

1. Modo Clase y Banco de Reactivos.
2. Evaluaciones, OMR, Libro y Alumno 360°.
3. Periodos, cierre académico y Reportes.
4. Configuración integral, editor de Agenda y cuenta.
5. Pruebas integrales con cuenta demo y sustitución controlada de `/teacher`.

## Condiciones de salida

La plataforma actual no se retira hasta que los recorridos docentes reales estén migrados y validados en escritorio, iPad e iPhone. Cada fase debe conservar RLS, los identificadores existentes y la posibilidad de volver temporalmente a `/teacher` para los módulos todavía no migrados.
