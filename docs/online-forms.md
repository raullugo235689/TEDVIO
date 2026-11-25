# Formularios en línea de TEDVIO

## Flujo docente

Abre **Evaluar → Formularios en línea → Nuevo formulario**. Escribe el título y las instrucciones, selecciona un grupo si deseas validar matrículas contra su padrón y elige preguntas de tu banco. Se admiten opción múltiple de respuesta única y verdadero/falso con una clave válida.

Puedes asignar todas las preguntas seleccionadas, sortear una cantidad global o definir cuántas se extraen de cada tema. En cada intento se realiza un sorteo en PostgreSQL y se conserva la selección junto con el orden de sus opciones. Las preguntas no se repiten dentro del intento. Los sorteos de alumnos diferentes pueden coincidir parcialmente.

Ejemplo: un banco de 70 preguntas puede asignar 35 mediante cupos de 10, 10, 8 y 7. Primero deben existir suficientes preguntas revisadas en cada tema. El módulo no crea automáticamente contenido académico ni amplía un banco de 35 a 70.

Cada pregunta vale un punto en el editor de esta versión. La configuración admite de 1 a 5 intentos por matrícula, tiempo opcional de 1 a 300 minutos, apertura y cierre opcionales, mezcla de opciones y tres políticas de retroalimentación: solo calificación, respuestas al enviar o resultados y respuestas después del cierre. Una fecha vacía de cierre requiere cerrarlo manualmente para liberar la retroalimentación configurada para el cierre.

Guarda el borrador, revisa su composición y pulsa **Publicar formulario**. Copia el enlace que aparece; el alumno puede abrirlo sin una cuenta docente. El borrador no admite respuestas. Tras el primer intento, la composición y las reglas quedan congeladas. El cierre finaliza los intentos abiertos utilizando exclusivamente las respuestas guardadas.

## Experiencia del alumno

El alumno declara su nombre y matrícula. En formularios vinculados a un grupo, la matrícula debe corresponder a un alumno activo y el nombre se toma del padrón. Esto no sustituye un mecanismo de autenticación de identidad personal.

El dispositivo conserva un secreto aleatorio generado antes de iniciar. El servidor almacena únicamente su hash. Ese secreto permite reanudar el mismo intento después de una recarga o una respuesta de red perdida. La matrícula por sí sola no recupera el acceso a otro intento. Cambiar de dispositivo o borrar el almacenamiento puede impedir reanudar; el mensaje explica que se debe usar el navegador original. El acceso puede cerrarse explícitamente después de entregar.

Las selecciones pendientes se conservan en el navegador y se distinguen de las confirmadas por el servidor. No se anuncia un guardado o envío exitoso sin confirmación. Antes de enviar se muestra cuántas preguntas quedarán vacías; las vacías asignadas valen cero. El tiempo y el cierre los valida PostgreSQL, independientemente del reloj del dispositivo.

## Resultados y Excel

**Actualizar resultados** consulta los nuevos intentos. **Descargar Excel** vuelve a consultar antes de generar un archivo `.xlsx` con cuatro hojas:

| Hoja | Contenido |
| --- | --- |
| Respuestas | Una fila por intento: fecha de entrega, alumno, matrícula, estado, puntos, porcentaje, nota sobre 10 y una columna por pregunta candidata. |
| Detalle | Preguntas asignadas en el orden visto por cada alumno, su respuesta, clave, acierto y puntos. |
| Reactivos | Copias originales de los enunciados, opciones, claves, temas, justificaciones y referencias conservadas en la explicación. |
| Resumen | Recuentos, promedio de intentos entregados y significado de las columnas y estados. |

Las columnas se alinean mediante el ID estable de la pregunta copiada. **No asignada** indica que no apareció en ese intento y no cuenta como error. **Sin responder** indica que sí apareció, pero no tiene respuesta guardada. Las opciones se exportan por texto, porque sus letras pueden variar al mezclarlas. Las matrículas permanecen como texto y conservan ceros iniciales. Las fechas del archivo están expresadas en UTC con formato ISO 8601.

Si se permiten varios intentos, se exportan todos; no se decide automáticamente cuál calificación utilizar. Esta versión no publica resultados en el Libro de calificaciones: la consulta y el Excel pertenecen al propio formulario.

## Activación y verificación

Migración aditiva: `supabase/migrations/20261124213410_online_forms_question_bank_attempts.sql`. Crea tablas y RPC propias; no migra ni modifica las tareas históricas. Antes de aplicar en un entorno, comprobar los contratos existentes `v2_question_bank`, `v2_groups` y `v2_group_students`. Aplicar la migración, refrescar la caché de PostgREST y construir/desplegar el frontend mediante el flujo protegido del repositorio. No basta con cambiar los archivos estáticos.

Se conserva el flujo de revisión descrito en `GITHUB-PRODUCTION-PROTECTION.md`. Para revertir el frontend, volver al artefacto anterior; conservar las tablas nuevas y sus datos, sin borrar intentos.

Pruebas:

```sh
cd apps/teacher-v2
npm ci
npm run test:online-forms
npm run quality
```

La suite SQL usa PostgreSQL aislado mediante PGlite y roles reales `anon`/`authenticated`, sin datos ni conexiones de producción. El recorrido de navegador se encuentra en `tests/browser/phase6-online-forms.spec.mjs` y conecta las RPC del formulario a esa misma implementación SQL. Ejecutar la suite canónica en Chromium y WebKit. Después del despliegue debe verificarse un formulario de prueba completo en la instalación real, incluida la descarga y apertura del Excel.

Límites de esta versión: 20 secciones, 1000 candidatas, 200 preguntas por intento y 1000 intentos registrados por formulario. La exportación se genera localmente en el navegador del docente y se carga solo al solicitarla.

## Navegación de examen

La vista del alumno presenta una pregunta a la vez, con Anterior y Siguiente. El guardado se confirma antes de avanzar; al recargar se retoma la primera pregunta sin responder y se conserva la muestra sorteada. La última pregunta permite revisar y enviar, incluyendo la confirmación de preguntas en blanco. Esta interfaz no impide capturas de pantalla ni inspección del navegador: el servidor conserva el mismo contrato de intento y nunca envía claves con `score_only`. Los formularios nuevos empiezan con **Solo calificación (sin clave)** y un intento; las políticas explícitas de práctica y las reglas de formularios ya guardados se conservan.
