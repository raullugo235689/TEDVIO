# TEDVIO 2.2 — Consolidación técnica y justificación por lote

## Alcance

Implementación a partir de main 9272ed96e1327240a49fb92fe271ebe9f52f0f8d. Conserva las tarjetas premium, las rutas públicas de alumno/proyección, las reglas de calificación y los controles fijos de Modo Clase.

## Cambios

- Asistencia: una RPC transaccional para registros/opciones/estado; revisión del servidor, recibos de reintento y bitácora de cambios. No hay fallback automático al guardado parcial anterior.
- Justificaciones: revisión de faltas existentes por fechas, grupos y alumno/matrícula; selección explícita, motivo y confirmación de listas cerradas. Las listas permanecen cerradas. Periodos académicos cerrados y registros QR en curso se bloquean. Revocar genera otra entrada de bitácora y conserva observaciones.
- Modo Clase: agrupar eventos y refrescar únicamente participantes o respuestas de la pregunta activa. Reconectar o cambiar los metadatos vuelve a comprobar el conjunto; el reloj y los comandos no cambian.
- Lecturas: páginas de 500 registros y lotes de hasta 100 identificadores en reportes/calificaciones. Los errores no devuelven un historial parcial como completo. Identidad/plan se cachean por cuenta sin sustituir comprobaciones de permisos del servidor.
- Políticas: consolidación de las políticas de propietario en categorías/evidencias y comprobación explícita de correspondencia de grupo/categoría.
- Estilos: carga por módulo de Analytics y ENARM, conservando el resto de capas para evitar regresiones de presentación. No se afirma haber reescrito todo el sistema de estilos.
- Dependencias: resolución fijada de source-map-js 1.2.2; auditoría del lockfile en CI. No se incrementan planes ni servicios de pago.
- Publicación: una compilación compartida por Chromium y WebKit; verificaciones SQL concurrentes; manifiesto de contenido y archivo de validación. Vercel rechaza un paquete cuyo contenido no corresponda al código y los resultados guardados. Solo el trabajo final de CI tiene permiso de escritura de artefactos.
- Versión visible y aviso de actualización manual. Nunca recarga automáticamente una captura pendiente ni el control de una clase.

## Pruebas

`npm run quality` incluye pruebas SQL aisladas mediante PGlite, protección entre docentes, correcciones sobre listas cerradas, rechazo de periodos cerrados, rollback, reintentos y políticas de calificaciones. La suite de paginación utiliza 2101 registros y los ensayos de eventos agrupan ráfagas de 35 y 100 eventos; esto no equivale a una prueba de 100 usuarios reales concurrentes.

CI prueba las nuevas pantallas en Chromium/WebKit, el flujo de asistencia existente y los demás recorridos. PostgreSQL 17 aislado comprueba carreras entre dos conexiones, reintentos concurrentes y recuperación mediante pg_dump/pg_restore de datos sintéticos, bitácora y RLS. El simulacro Supabase existente reconstruye todas las migraciones sin conectarse a producción.

## Despliegue

1. Aprobar pruebas de la rama y reconstrucción aislada del esquema.
2. Aplicar las dos migraciones revisadas mediante la herramienta de migraciones; no ejecutar modificaciones masivas de alumnos o faltas.
3. Publicar únicamente el artefacto construido y aprobado por CI. `node .github/scripts/release-integrity.mjs verify` debe aprobar en Vercel.
4. Verificar dominio/commit de producción. Las pestañas antiguas necesitan una recarga voluntaria; no se fuerzan recargas durante clase.

## Límites explícitos

No se habilitan servicios de pago, protección de contraseñas filtradas limitada por plan, reglas administrativas de GitHub sin permiso, ni pruebas invasivas sobre producción. No se eliminan índices por un aviso de «no usado» ni se añaden los 27 índices del asesor indiscriminadamente. La recuperación verificada aquí usa datos sintéticos; no certifica un respaldo completo de los datos ni de todos los archivos de Storage de producción. Una prueba de carga multicuenta prolongada, retención de bitácoras y reorganización completa de estilos quedan como trabajo separado, medible y revisable.

La tabla histórica de asistencia mantiene acceso compatible con versiones anteriores; las nuevas RPC validan estados, permisos y revisión. Las escrituras antiguas incrementan la revisión para detectar cambios, pero no se atribuye una nueva bitácora a operaciones históricas anteriores a este despliegue.
