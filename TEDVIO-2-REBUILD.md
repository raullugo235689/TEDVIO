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

## Fase 4B · OMR

- Rutas React nativas para catálogo OMR, evaluación, captura y hojas imprimibles.
- Hojas A4 genéricas o personalizadas con nombre, matrícula, versión, QR y cuatro marcas negras.
- Distribución de versiones A, B y C para el padrón.
- Cámara trasera o selección de imagen desde iPhone, iPad y escritorio.
- Detección local de perspectiva, marcas y burbujas; la fotografía no se guarda en Supabase.
- QR opcional para reconocer evaluación, versión y alumno.
- Revisión obligatoria de respuestas ambiguas o en blanco antes de confirmar.
- Captura manual y corrección de resultados existentes.
- Calificación recalculada en PostgreSQL mediante un RPC atómico; el navegador no decide la nota definitiva.
- Resultados confirmados o pendientes de revisión.
- Archivo sin eliminación física y revisiones históricas automáticas.
- Exportación CSV bajo demanda.
- Sin IA generativa ni costos de inferencia.

## Fase 4C · Libro de calificaciones

- Rutas React nativas para catálogo de grupos y Libro por grupo.
- Selección de curso completo o periodo académico.
- Configuración ponderada con suma obligatoria de 100%.
- Estructura inicial 40/30/20/10 para grupos sin categorías.
- Categorías manuales, OMR, Asistencia y Participación Live.
- Actividades manuales con fecha, puntaje máximo y periodo protegido.
- Captura masiva por padrón, notas y validación del rango de cada evidencia.
- Normalización de cada actividad a escala 0–10 antes de entrar en su categoría.
- Promedio ponderado únicamente con categorías que ya contienen evidencia, mostrando el porcentaje que respalda cada resultado.
- Vinculación explícita de evaluaciones OMR con el Libro.
- Solo resultados OMR confirmados y activos se publican como calificación.
- Actualización automática del Libro cuando cambia un resultado OMR ya vinculado.
- Matriz de evidencias, cobertura, pendientes, promedio y aprobación.
- Snapshots de periodos cerrados como resultado oficial de solo lectura.
- Bitácora inmutable para categorías, actividades y calificaciones.
- Exportación CSV bajo demanda.
- Sin eliminación física, IA generativa ni costos de inferencia.

## Fase 4D · Alumno 360°

- Directorio global de alumnos con búsqueda por matrícula, nombre, asignatura y grupo.
- Ruta React propia para cada expediente académico.
- Resumen actual mediante la misma fuente de cálculo del Libro.
- Promedio provisional u oficial, asistencia, OMR y peso respaldado por evidencia.
- Alertas deterministas por promedio, asistencia, pendientes y descenso entre periodos.
- Siguiente acción explicable y enlazada al módulo correspondiente.
- Trayectoria por periodos con cambio, asistencia, OMR, evidencia y estado académico.
- Evidencias manuales, evaluaciones OMR, asistencia, tareas digitales y sesiones Live.
- Observaciones docentes con motivo de actualización e historial protegido.
- Trazabilidad de cambios en calificaciones y correcciones OMR.
- Exportación CSV individual bajo demanda.
- RLS por docente, escritura mediante RPC y bloqueo de eliminación de observaciones.
- Sin IA generativa ni costos de inferencia.

## Próximos bloques

1. Fase 5 · Periodos, cierre académico, Reportes y Configuración.
2. Pruebas integrales con cuenta demo y sustitución controlada de `/teacher`.

## Condiciones de salida

La plataforma actual no se retira hasta que los recorridos docentes reales estén migrados y validados en escritorio, iPad e iPhone. Cada bloque debe pasar TypeScript, auditoría arquitectónica, seguridad de base de datos y build reproducible antes de fusionarse.
