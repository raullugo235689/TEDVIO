# Formularios en línea de TEDVIO

## Flujo docente

Abre **Evaluar → Formularios en línea → Nuevo formulario**. Escribe el título y las instrucciones, selecciona un grupo si deseas validar matrículas contra su padrón y elige preguntas de tu banco. Se admiten opción múltiple de respuesta única y verdadero/falso con una clave válida.

Puedes asignar todas las preguntas seleccionadas, sortear una cantidad global o definir cuántas se extraen de cada tema. En cada intento se realiza un sorteo en PostgreSQL y se conserva la selección junto con el orden de sus opciones. Las preguntas no se repiten dentro del intento. Los sorteos de alumnos diferentes pueden coincidir parcialmente.

Ejemplo: un banco de 70 preguntas puede asignar 35 mediante cupos de 10, 10, 8 y 7. Primero deben existir suficientes preguntas revisadas en cada tema. El módulo no crea automáticamente contenido académico ni amplía un banco de 35 a 70.

Cada pregunta vale un punto en el editor de esta versión. La configuración admite de 1 a 5 intentos por matrícula, tiempo opcional de 1 a 300 minutos, apertura y cierre opcionales, mezcla de opciones y tres políticas de retroalimentación: solo calificación, respuestas al enviar o resultados y respuestas después del cierre. Una fecha vacía de cierre requiere cerrarlo manualmente para liberar la retroalimentación configurada para el cierre.

Guarda el borrador, revisa su composición y pulsa **Publicar formulario**. Copia el enlace que aparece; el alumno puede abrirlo sin una cuenta docente. El borrador no admite respuestas. Al publicar se fija la composición de preguntas y grupos. El cierre manual finaliza los intentos abiertos utilizando exclusivamente las respuestas guardadas.

## Editar una configuración publicada

Abre el formulario y pulsa **Editar configuración**. Puedes cambiar el título, las instrucciones, el máximo de intentos, el tiempo por intento, las fechas de apertura y cierre, la mezcla de opciones, la retroalimentación y la navegación. **Guardar configuración** conserva el enlace, las preguntas, las respuestas y el estado publicado o cerrado. Guardar un formulario cerrado no lo reabre.

El título y las instrucciones se actualizan de inmediato. Las reglas de navegación, la fecha límite y la retroalimentación se conservan por intento desde que comienza; las nuevas reglas se aplican a quienes inicien después de guardar. El máximo de intentos y la apertura/cierre controlan los nuevos accesos. Modificar el cierre programado no recorta ni extiende el plazo ya asignado a un alumno. El cierre manual sigue siendo una acción explícita que finaliza los intentos abiertos.

La configuración se guarda con comprobación de revisión: dos pestañas docentes no pueden sobrescribir silenciosamente cambios entre sí. La edición de ajustes no vuelve a consultar el banco para reconstruir las preguntas, por lo que conserva sus copias incluso si después se archiva una pregunta del banco.

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

Migración inicial: `supabase/migrations/20261124213410_online_forms_question_bank_attempts.sql`. La actualización de ajustes y navegación es `supabase/migrations/20261126183910_online_forms_editable_settings_forward_navigation.sql`, posterior a la migración de grupos declarados. Conserva los intentos existentes con navegación libre y copia su política de retroalimentación vigente. Antes de aplicar en un entorno, comprobar los contratos existentes `v2_question_bank`, `v2_groups` y `v2_group_students`. Aplicar las migraciones aditivas, refrescar la caché de PostgREST y construir/desplegar el frontend mediante el flujo protegido del repositorio. No basta con cambiar los archivos estáticos.

El cliente actualizado inicia mediante `v2_online_form_start_configured`. Los clientes anteriores conservan el acceso libre y la reanudación de sus intentos; deben actualizarse antes de crear un intento de avance único. El servidor rechaza ese inicio antiguo antes de consumir un intento. Activar avance único en un formulario publicado requiere que el nuevo frontend ya esté disponible.

Se conserva el flujo de revisión descrito en `GITHUB-PRODUCTION-PROTECTION.md`. Para revertir el frontend, usar un artefacto validado compatible con los modos de los intentos activos; una versión anterior al protocolo de avance único no puede completar esos intentos. Conservar las tablas y los datos, sin borrar intentos ni cambiar sus reglas para permitir un retroceso.

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

La vista del alumno presenta una pregunta a la vez. En **Libre: puede volver a revisar**, dispone de Anterior y Siguiente y puede cambiar respuestas antes de entregar. El guardado se confirma antes de avanzar; al recargar se conserva la muestra sorteada y se retoma la primera pregunta sin responder.

En **Solo avanzar: sin regresar**, la portada avisa la regla antes de comenzar. Siguiente pide confirmar el cierre de la pregunta y muestra la respuesta que quedará registrada; si está vacía, avisa que valdrá cero puntos. El servidor entrega únicamente la pregunta actual y guarda un cursor que no puede retroceder. Rechaza respuestas a preguntas anteriores o futuras y no permite entregar antes de llegar a la última, salvo cierre o vencimiento. Un reintento de la misma solicitud de avance devuelve el estado actual y no salta una segunda pregunta.

Tras una recarga, una respuesta de red perdida o una acción desde otra pestaña, la recuperación consulta el cursor del servidor. El avance queda bloqueado sin conexión o mientras hay una respuesta pendiente. La última pregunta permite **Confirmar entrega**, con aviso de preguntas vacías. Las respuestas anteriores siguen disponibles para el docente y para la calificación; la retroalimentación al finalizar respeta la política guardada para ese intento.

Esta medida controla la navegación y edición dentro del formulario; no impide capturas de pantalla, consultas externas ni el uso de otro dispositivo. Los formularios nuevos empiezan con navegación libre, **Solo calificación (sin clave)** y un intento. El docente puede activar avance único desde la configuración sin alterar las reglas de quienes ya comenzaron.

## Grupos declarados y vista de evaluación

Al crear un formulario sin grupo vinculado, el docente puede introducir hasta 20 etiquetas de grupo separadas por comas. El alumno debe seleccionar una de ellas junto con su nombre completo y matrícula; el servidor valida la lista y conserva la etiqueta en el intento, los resultados y Excel. Esta modalidad **no valida pertenencia al padrón** ni crea grupos académicos. Los formularios de grupo único mantienen la validación anterior. Un formulario publicado sin lista puede recibirla por primera vez sin alterar intentos previos (quedan sin grupo registrado); la lista ya publicada no puede reemplazarse. Ambos modos de navegación conservan la selección de grupo, el guardado confirmado y las claves privadas con Solo calificación.
