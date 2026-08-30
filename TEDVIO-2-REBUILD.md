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

## Fase 4A · Evaluaciones

- Ruta React nativa para listado, creación, edición y consulta de evaluaciones.
- Composición desde Question Studio con reactivos objetivos compatibles con OMR.
- Orden, puntaje, materia, grupo, periodo, fecha e instrucciones.
- Versiones A, B y C con estrategia de orden común o balanceado.
- Fotografía normalizada de cada reactivo y clave por versión.
- Estados protegidos: borrador, lista, cerrada y archivada.
- Duplicación sin copiar resultados ni eliminar evidencia histórica.
- Resumen académico, resultados existentes y lectura descriptiva por reactivo y versión.
- Compatibilidad conservada con las tablas y flujos OMR anteriores.

## Fase 4B · Captura OMR

- Ruta React nativa para selección de evaluación, impresión, captura y resultados.
- Hojas A4 genéricas o personalizadas por alumno, con versiones alternadas A/B/C.
- Cuatro marcas de referencia para corregir orientación y perspectiva.
- Cámara trasera, carga de fotografía y captura manual de respaldo.
- Procesamiento local mediante Canvas; la imagen no se sube ni se conserva.
- Clasificación de marcas claras, ambiguas y en blanco.
- Bloqueo de confirmación mientras existan marcas ambiguas.
- Revisión manual de cada respuesta antes de publicar el resultado.
- Recalculo definitivo en PostgreSQL a partir de la clave protegida.
- Validación de evaluación lista, versión, grupo, padrón y propiedad docente.
- Correcciones sin eliminación: el valor anterior queda en `revision_log`.
- Exportación CSV del concentrado confirmado.
- Sin IA generativa, OCR externo ni costos de inferencia.

## Próximos bloques

1. Fase 4C · Libro de calificaciones: categorías, evidencias, ponderaciones y publicación.
2. Fase 4D · Alumno 360°: expediente consolidado y trayectoria por periodo.
3. Fase 5 · Periodos, cierre académico, Reportes y Configuración.
4. Pruebas integrales con cuenta demo y sustitución controlada de `/teacher`.

## Condiciones de salida

La plataforma actual no se retira hasta que los recorridos docentes reales estén migrados y validados en escritorio, iPad e iPhone. Cada bloque debe pasar TypeScript, auditoría arquitectónica, seguridad de base de datos y build reproducible antes de fusionarse.
