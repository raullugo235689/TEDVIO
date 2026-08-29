# TEDVIO 2.0 · Frontend docente unificado

## Estrategia

La reconstrucción se realiza en paralelo y conserva producción en `/teacher`. La vista nueva vive en `/teacher-v2/` hasta completar la migración.

## Fase 1

- React + TypeScript + Vite.
- Un solo `AppShell` persistente.
- Un solo router.
- Un solo cliente Supabase.
- Autenticación compatible con la sesión existente.
- Dashboard real mediante `v2_teacher_today_dashboard`.
- Agenda mediante `v2_group_schedule_slots`.
- Grupos de lectura utilizando el resumen seguro ya disponible.
- Sin cambios de esquema, migraciones o RLS.

## Próximas fases

1. Configuración, perfil y editor de Agenda.
2. Grupos, alumnos y Asistencia Pro.
3. Modo Clase y Banco de Reactivos.
4. Evaluaciones, OMR, Libro y Alumno 360°.
5. Periodos, cierre académico y Reportes.
6. Pruebas integrales con cuenta demo y sustitución controlada de `/teacher`.

## Condiciones de salida

La plataforma actual no se retira hasta que los recorridos docentes reales estén migrados y validados en escritorio, iPad e iPhone.
