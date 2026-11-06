# Interactive Lab · entrega 02 — recorrido nativo (en revisión)

Esta entrega continúa la PR #131. No está autorizada para producción: no se fusiona main ni se aplica la migración a la base real. La migración original continúa sin aplicar y se amplía en la misma revisión; no se modifica una migración productiva.

## Superficies implementadas

- `/teacher#/interactive-lab`: catálogo paginado de actividades y asignaciones reales de la cuenta. Acceso desde Biblioteca y el buscador de herramientas; se conservan las cinco áreas principales.
- `/teacher#/interactive-lab/new`: plantilla nativa de opción múltiple y respuesta numérica con tolerancia. Borrador de captura protegido por cuenta; claves separadas del manifiesto público. Guardado idempotente, publicación y asignación como decisiones separadas.
- `/teacher#/interactive-lab/assignments/:id`: destinatarios del padrón, conteos reales, resultado seleccionado, consulta de respuestas, códigos personales revocables, visibilidad de puntuación y exportación CSV de todos los destinatarios, no solo la página visible.
- `/teacher#/lab-access`: acceso estudiantil con cliente Supabase aislado. Verifica el código individual, presenta instrucciones antes de comenzar, permite reanudar, envía respuestas, valida el recibo del protocolo oficial y permite consultar la puntuación únicamente cuando el docente la habilita.

## Seguridad y semántica

El código personal se mantiene en memoria: no se incluye en URL, consultas de navegación, telemetría, localStorage ni sessionStorage. La emisión exige confirmación de verificación del destinatario. Su posesión NO acredita identidad institucional ni impide compartirlo. El docente debe entregarlo de forma individual. El enlace público de acceso no es secreto.

Los únicos datos temporales estudiantiles en sessionStorage son borradores y solicitudes pendientes, bajo una clave derivada por SHA-256. Nunca se usan como resultado oficial ni se considera recibida una entrega sin recibo exacto del servidor. Si falla el almacenamiento, se avisa de la necesidad de mantener abierta la pestaña. El mismo identificador y el mismo contenido se conservan al reintentar una entrega.

La creación de actividad y asignación también recibe identificadores idempotentes. Un reintento idéntico devuelve el recibo original; reutilizar el identificador con otros datos se rechaza. Los permisos continúan comprobándose en SQL; la navegación no crea alumnos ni notas.

Ningún resultado se publica automáticamente en el Libro. El CSV distingue resultados verificados, pendientes de revisión y alumnos sin entrega. Neutraliza fórmulas y conserva cero como valor real. Una exportación paginada incompleta falla sin descargar un archivo parcial. No constituye una fotografía transaccional simultánea de toda la asignación: las lecturas se efectúan al exportar.

## Pruebas

- Pruebas Node/PGlite y de protocolo extendidas a 38 casos, con validación de tipos y compilación.
- Suite nativa preparada para **Supabase local restaurado desde migraciones, Auth real, PostgREST real y PostgreSQL real**. No falsifica respuestas de los RPC del Lab. Solo sustituye la configuración de conexión por el entorno aislado.
- Recorrido: creación, publicación, asignación, emisión de acceso personal, instrucciones sin consumo de intento, resolución, pérdida de respuesta después del commit, reintento exacto, recibo, recarga del panel, consulta de respuestas y CSV. Comprueba denegación anónima y de otro docente, y puntuación oculta/visible.
- Evidencia visual prevista a 320/390/768/1280 px, sin credenciales ni trazas de navegador en artefactos. Las cuentas y alumnos son sintéticos exclusivamente en la base local.
- El navegador local de esta sesión bloqueó loopback por política; no se elude ni se presenta como prueba aprobada. El resultado final del workflow nativo debe registrarse por separado.

## No incluido / bloqueos antes de publicación

Importación de HTML/ZIP externos, Atlas con imágenes del docente, revisión manual, nota oficial, asignaciones por plan, rate limiting público y retención definitiva siguen pendientes. Se mantiene el límite de esta entrega nativa revisada: no se ejecuta HTML de terceros. No se da por resuelto el problema de manejo del proyector descrito anteriormente.

El control general de publicación mantiene el aviso de Vite 8.2.2 y el runner antiguo incompatible con ubuntu-latest. No se desactiva la auditoría para presentar esta entrega como publicable. También faltan las pruebas prolongadas multicuenta y recuperación de datos/archivos reales previamente documentadas.
