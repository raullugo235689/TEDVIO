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

## Fase 2 · Grupos, alumnos y Asistencia Pro

- Estructura Institución → Programa → Grupo.
- Creación y edición de grupos.
- Centro de grupo con ruta propia.
- Alta, edición, importación, desactivación y reactivación de alumnos.
- Asistencia diaria con Presente, Retardo, Falta y Justificada.
- Guardar, pausar, reanudar, cerrar y reabrir listas.
- Sin eliminación física de grupos, alumnos o listas.

## Fase 3 · Modo Clase y Question Studio

- Banco de Reactivos con búsqueda, filtros, carpetas, etiquetas, dificultad y nivel cognitivo.
- Autoría y edición de los tipos de pregunta ya soportados por TEDVIO.
- Favoritos, duplicación y archivo sin eliminación física.
- Métricas de uso, acierto y discriminación mediante el RPC existente.
- Selección de reactivos para crear una sesión o ampliar una sesión abierta.
- Cockpit docente con lobby, código, proyección, participantes, cronómetro y respuesta en vivo.
- Lanzar, cerrar, revelar y avanzar preguntas.
- Ranking individual o por equipos, distribución de respuestas y resumen de cierre.
- Alumno aleatorio, contadores locales transparentes y nota persistente en el expediente.
- Supabase Realtime en lugar de polling permanente.
- Sin IA generativa ni costos de inferencia.

## Próximas fases

1. Evaluaciones, OMR, Libro y Alumno 360°.
2. Periodos, cierre académico, Reportes y Configuración.
3. Pruebas integrales con cuenta demo y sustitución controlada de `/teacher`.

## Condiciones de salida

La plataforma actual no se retira hasta que los recorridos docentes reales estén migrados y validados en escritorio, iPad e iPhone. Cada fase debe pasar TypeScript, auditoría arquitectónica y build reproducible antes de fusionarse.
