# TEDVIO 2.0 · Frontend docente unificado

## Estrategia

La reconstrucción se realiza en paralelo y conserva producción en `/teacher`. La vista nueva vive en `/teacher-v2/` hasta completar la validación integral.

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

## Fase 4B · OMR

- Rutas React nativas para catálogo OMR, evaluación, captura y hojas imprimibles.
- Hojas A4 genéricas o personalizadas con nombre, matrícula, versión, QR y cuatro marcas negras.
- Cámara trasera o selección de imagen desde iPhone, iPad y escritorio.
- Detección local de perspectiva, marcas y burbujas; la fotografía no se guarda en Supabase.
- Revisión obligatoria de respuestas ambiguas o en blanco antes de confirmar.
- Calificación recalculada en PostgreSQL mediante un RPC atómico.
- Resultados confirmados o pendientes de revisión.
- Archivo sin eliminación física y revisiones históricas automáticas.
- Exportación CSV bajo demanda.

## Fase 4C · Libro de calificaciones

- Rutas React nativas para catálogo de grupos y Libro por grupo.
- Selección de curso completo o periodo académico.
- Configuración ponderada con suma obligatoria de 100%.
- Categorías manuales, OMR, Asistencia y Participación Live.
- Actividades manuales con fecha, puntaje máximo y periodo protegido.
- Captura masiva por padrón, notas y validación del rango de cada evidencia.
- Promedio ponderado, peso respaldado por evidencia y lectura estricta.
- Vinculación explícita de evaluaciones OMR con el Libro.
- Snapshots de periodos cerrados como resultado oficial de solo lectura.
- Bitácora inmutable para categorías, actividades y calificaciones.

## Fase 4D · Alumno 360°

- Directorio global de alumnos con búsqueda por matrícula, nombre, asignatura y grupo.
- Ruta React propia para cada expediente académico.
- Resumen actual mediante la misma fuente de cálculo del Libro.
- Promedio provisional u oficial, asistencia, OMR y peso respaldado por evidencia.
- Alertas deterministas y siguiente acción explicable.
- Trayectoria por periodos con cambio, asistencia, OMR, evidencia y estado académico.
- Evidencias manuales, evaluaciones OMR, asistencia, tareas digitales y sesiones Live.
- Observaciones docentes con motivo de actualización e historial protegido.
- Exportación CSV individual bajo demanda.

## Fase 5 · Periodos, Reportes y Configuración

- Catálogo y detalle de periodos académicos dentro del router unificado.
- Plantilla de 3 parciales + final con 25% cada uno.
- Creación y edición protegidas por RPC, sin traslapes ni transferencia entre docentes.
- Resumen de preparación con bloqueos, advertencias, categorías, asistencia, OMR y captura manual.
- Cierre formal con snapshot oficial por alumno.
- Reapertura controlada con motivo y bitácora de transiciones.
- Centro de reportes para padrón, asistencia, calificaciones, evaluaciones, sesiones y resumen del grupo.
- CSV e impresión/PDF del navegador bajo demanda, sin nuevas librerías pesadas.
- Identidad institucional, responsable de Vo. Bo. y código documental en reportes.
- Perfil docente, grupo predeterminado y umbrales académicos por grupo.
- Centro de privacidad con versiones legales, aceptaciones e historial.
- Cambio de contraseña, cierre de otras sesiones, exportación de datos y solicitud de eliminación.
- Configuración institucional para administradores activos.
- Un solo cliente Supabase, RLS, RPC `SECURITY INVOKER` y ejecución anónima revocada.
- Sin IA generativa ni costos de inferencia.

## Siguiente bloque

1. Fase 6 · Cuenta demo, pruebas integrales en escritorio/iPad/iPhone y sustitución controlada de `/teacher`.

## Condiciones de salida

La plataforma actual no se retira hasta que los recorridos docentes reales estén validados en escritorio, iPad e iPhone. Cada bloque debe pasar TypeScript, auditoría arquitectónica, seguridad de base de datos, build reproducible y despliegue verificable antes de fusionarse.
