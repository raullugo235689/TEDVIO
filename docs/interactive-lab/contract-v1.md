# TEDVIO Interactive Lab · Contrato inicial v1

## Versiones y estados
Protocolo: `tedvio.lab/1`. `activityId`, `versionId`, `assignmentId`, `attemptId` son UUID del servidor; `version` es entero positivo. Una asignación permanece ligada a su versión original. `verified` significa resultado calculado por el evaluador del servidor, **no nota oficial**; `provisional` requiere revisión y no tiene puntuación automática. En este incremento `official_grade` siempre es false.

## Paquete mínimo documentado
El ejemplo contiene `index.html`, `activity.mjs`, `manifest.json` y `answer-key.teacher.json`. Copiar las tres piezas del SDK al subdirectorio `sdk/` para servirlo en un entorno de revisión. La clave `answer-key.teacher.json` es exclusivamente para la importación privada docente: **NO debe desplegarse en el directorio público, enviarse al navegador alumno ni empaquetarse como recurso ejecutable**. La futura ingestión debe separar físicamente clave privada y recursos públicos antes de aprobar un paquete.
El ejemplo no implementa el importador ni publica archivos automáticamente. No cargarlo directamente en la página docente. No usar document.write, innerHTML o eval del host con contenido importado.

## API de una actividad
```js
import { connectActivity } from './sdk/activity.mjs';
const lab = await connectActivity({ hostOrigin: 'https://ORIGEN-CONFIABLE' });
lab.answer('q1', 'a');
lab.answer('q2', 4);
const receipt = await lab.complete();
// Solo aquí mostrar recepción confirmada. Un error conserva la misma entrega.
// Reintentar lab.complete() reutiliza el identificador y el contenido.
```
No existe `setScore()`. El cliente solo transmite respuestas. Al empezar la entrega se congela el contenido; corregir una respuesta después de una confirmación exige un intento nuevo autorizado por el servidor.
`complete` transporta exactamente `{ protocol, type, context, requestId, answers }`. No admite campos de nota, credencial, alumno ni sesión docente. Hasta 100 respuestas, valores JSON acotados y 64 KiB; el servidor vuelve a validar ids, tipos y opciones.

## Integración del host nativo (a construir)
1. Obtener el acceso individual por un mecanismo verificado; conservarlo en el host confiable, nunca en el iframe.
2. Reutilizar `createLabLearnerAccess` del frontend; iniciar con un requestId estable.
3. Obtener el manifiesto público y contexto de `v2_lab_begin`.
4. Después de cargar la actividad aislada, usar `attachLabHost({ iframe, context, submit })`; submit invoca `v2_lab_submit` con la credencial solo desde el host.
5. Validar el recibo y presentar estados de enviando/sin confirmar/confirmado. No reemplazar fallos por resultados locales.
6. Al abandonar o navegar el iframe, cerrar ambos extremos del canal; reconciliar el recibo con `v2_lab_receipt` al recuperarse de una interrupción.

El token puede transportarse inicialmente por fragmento y eliminarse inmediatamente del historial en el futuro host, pero esta entrega **no implementa ni activa ese flujo**. Requiere revisión explícita y política de privacidad/recuperación.

## Aislamiento
El puente exige `sandbox="allow-scripts"` y rechaza permisos adicionales (same-origin, formularios, ventanas, navegación superior). El host envía un bootstrap no secreto al contentWindow exacto. Como ese sandbox genera origen opaco, solamente ese bootstrap utiliza targetOrigin `*`; no es un receptor global permisivo. La actividad exige el origen HTTPS exacto y event.source===parent; el resto usa el puerto privado, contexto inmutable y nonce. La credencial, nombres, matrículas, sesión docente y clave de respuestas nunca viajan al iframe.
Este puente **no convierte por sí solo HTML arbitrario en seguro**. Antes de importar se requiere cuarentena, límite de archivos/descompresión, validación de rutas y MIME, detección de claves embebidas, recursos locales aprobados y políticas HTTP/CSP del servidor de ejecución. La CSP del fixture bloquea fetch y otros recursos; no se presenta como un control exhaustivo de todos los canales de navegación o como certificación de paquetes maliciosos.
Referencias primarias: MDN iframe y Window.postMessage; Supabase Row Level Security. El diseño debe revisarse contra los navegadores soportados antes del lanzamiento.

## Evaluadores iniciales
- `answer-key-v1`: opciones con id estable o número con tolerancia absoluta no negativa. El peso y la clave viven en tabla privada.
- `review-required-v1`: conserva respuestas y marca provisional, con score null. La operación docente de revisión/calificación es posterior.
- La versión inicial del manifiesto no admite imágenes, polígonos, drag-and-drop, simulaciones arbitrarias ni ramas; estos tipos requieren una versión/adaptador y evaluador explícito. No ocultar ese límite a los autores.

## Consultas y exportación
`v2_lab_results` ofrece páginas de 1–500 destinatarios, resumen real de asignados/iniciados/finalizados y el intento seleccionado. Aún no calcula comparaciones, dificultad ni promedio grupal. Recuperar todas las páginas para exportar; nunca presentar una página como historial completo. `safeCsvCell` protege texto frente a fórmulas y escapa CSV; no genera un XLSX ni un reporte por sí solo.

## Idempotencia y límites
La entrega atómica guarda respuestas y resultado juntos. Repetir requestId y respuestas retorna el recibo; cambiar datos del intento confirmado devuelve conflicto PT409. Reabrir un intento activo no consume cuota; al recargar conservar el requestId de inicio original. La prueba PGlite es secuencial: los locks diseñados necesitan validación multi-conexión PostgreSQL y límites HTTP antes del piloto.
La credencial es revocable, se almacena solo como hash y permite consultar recibos hasta 30 días después del cierre. Iniciar o enviar después del cierre sigue prohibido. Política inicial pendiente de aprobación para producción.
