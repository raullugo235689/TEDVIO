# TEDVIO · Mapa maestro del producto

Entrega: organización 2.3.0. Base: b1db59aa2d5422bc74c4f2f922869eab3f1e2e72.
Estado de este documento en la rama: implementado; la publicación requiere CI y confirmación del dominio.

## Cinco áreas de trabajo

| Área | Ruta conservada | Herramientas que reúne |
| --- | --- | --- |
| Hoy | / | Agenda (/agenda), clases (/classroom), próxima actividad y pendientes |
| Grupos | /groups | Asistencia (/attendance), justificaciones (/attendance-justifications), registro conjunto (/attendance-joint), alumnos (/students) |
| Biblioteca | /prepare | Banco (/bank), acceso contextual a preparar clase o reutilizar preguntas en un examen |
| Evaluar | /evaluate (nueva) | Exámenes (/exams y /exams/new), calificar hojas (/omr), calificaciones (/gradebook), periodos (/periods) |
| Resultados | /reports | Documentos/reportes y participación/aprendizaje (/analytics) |

Todas las herramientas existentes conservan sus rutas y controles del servidor. Cambiar de sección no crea, elimina, inicia, revela, justifica ni publica datos académicos. Cuenta, configuración, soporte y formación personal están separados de las cinco áreas principales. ENARM conserva su ruta y acceso personal; no se publican sus contenidos.

## Accesos y contexto

- La navegación inferior tiene cinco enlaces. «Más», en la cabecera, abre el catálogo buscable de herramientas. Escape, foco y cierre no reemplazan confirmaciones de guardado.
- Iniciar clase es un enlace al flujo existente, no una mutación. Una única sesión en vivo ofrece Volver a la clase; varias exigen elegir. Los borradores y demos no cuentan como sesiones activas.
- El grupo viaja explícitamente en rutas o parámetros de URL. No se guarda un «último grupo» que otra cuenta pueda heredar. Los enlaces contextuales se validan contra los grupos de la cuenta cargada.
- Biblioteca y Evaluar permiten seleccionar grupo y periodo. Cambiar grupo elimina el periodo previo. Se comprueba que el periodo pertenece al grupo antes de incluirlo en enlaces. No se aplica un periodo de forma automática a asistencia o a un nuevo examen.
- Calificaciones y Reportes conservan periodos explícitos. «Curso completo» se traduce al contrato correspondiente de cada herramienta; nunca se envía `course` como UUID de periodo a Reportes.
- El banco sigue siendo común al docente. «Mis evaluaciones» acepta el filtro explícito de grupo. Registro conjunto y escaneo solicitan sus selecciones propias; no heredan silenciosamente un grupo.
- Cambios de permisos, calificación y escritura siguen en las capas existentes. No se introducen tablas ni migraciones.

## Verificación de la entrega

1. `npm run test:workflow`: URL, grupo, periodo, sesión, cuenta, codificación y elección inequívoca de clase.
2. `npm run quality`: tipado, dominio, seguridad, arquitectura y compilación.
3. Chromium y WebKit: rutas anteriores, cinco áreas, buscador, foco/Escape, selección de grupo/periodo, estados sin datos, temas y 320/390/768/1280 px; regresiones completas de asistencia, justificaciones, evaluación y proyección.
4. El mismo paquete validado debe recibir atestación del proceso existente. Verificación de integridad obligatoria en Vercel; no se desactiva.
5. La evidencia del piloto con profesores es independiente de los tests automáticos. No se afirma haber realizado una prueba de usabilidad con personas por aprobar navegadores.

## Plan comercial y pendientes (no publicados como funcionalidades)

| Etapa | Estado | Criterio para avanzar |
| --- | --- | --- |
| Organización y recorridos de herramientas existentes | Implementado en esta entrega | CI, evidencia visual, dominio/version servida |
| Prueba de navegación con profesores ajenos al desarrollo | Pendiente de participantes | Encontrar tareas sin explicar los menús |
| Primera experiencia y demostración comercial revisadas | Guía y demo existentes conservadas; mejora pendiente | Demostración comprensible con datos separados |
| Sitio comercial independiente y contenido autorizado | Pendiente | Mensaje, video real, accesos de alumnos intactos |
| Piloto de 15 docentes durante cuatro semanas | Propuesto, no realizado | Activación, repetición, soporte y disposición a pagar |
| Docente Pro | Hipótesis de 199 MXN/mes; sin cobros activos por esta entrega | Costos y condiciones revisados, cancelación y soporte operativos |
| Oferta institucional | Posterior al piloto | Capacidades administrativas y soporte comprobados |

No se anuncian porcentajes de ahorro, clientes, disponibilidad garantizada ni respaldo integral no demostrado. No se activan servicios de pago, publicidad, pagos, mensajes masivos ni cuentas sintéticas en producción. No se modifica el sitio raíz, los enlaces QR ni las rutas públicas del alumno/proyector.

## Regla para siguientes entregas

Cada cambio debe indicar: solicitado → programado → probado → publicado. Registrar ruta, permiso, prueba y versión. Actualizar este mapa al añadir una herramienta; un acceso contextual reutiliza la misma función y no constituye una implementación nueva. Cerrar los pendientes de carga prolongada, restauración integral y retención de datos antes de afirmar disponibilidad comercial general.
