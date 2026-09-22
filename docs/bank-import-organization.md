# Banco: importación, organización y respaldo

## Uso

- Banco → Importar preguntas: pegar tablas de Excel/Sheets, texto estructurado o cargar CSV, TXT y JSON. Archivos de hasta 2 MB; cada guardado importa hasta 500 preguntas. Los lotes mayores permanecen abiertos para continuar después de actualizar el banco.
- Los errores de origen se corrigen en el texto; bloquean el guardado completo hasta resolverlos. La vista previa permite editar enunciado, opciones, clave simple, materia, tema, carpeta y explicación. Para claves múltiples o de texto se edita el JSON de origen.
- Los posibles duplicados se omiten. Se comparan enunciado y opciones; no es una conciliación de versiones y no reemplaza preguntas existentes.
- Seleccionar visibles conserva la selección anterior. Organizar muestra cuántas preguntas se afectarán, incluidas las ocultas por filtros. Permite asignar o vaciar materia, tema o carpeta, y archivar/restaurar hasta 500 preguntas por operación.
- Respaldar banco JSON incluye también las archivadas. Exportar selección limita el archivo a los reactivos elegidos. Se conservan contenido, claves y clasificación; no se incluyen IDs, propietario, métricas ni información de alumnos. Los recursos multimedia permanecen como enlaces, no se descargan sus archivos.
- El respaldo incluye claves: debe conservarse en privado. Los tipos de datos no compatibles se reportan como errores al importar; no se convierten silenciosamente.

## Integridad

Se reutiliza el importador del creador de exámenes. Las columnas A–E se ordenan por letra; huecos internos y opciones repetidas se rechazan para no desplazar la clave. CSV admite comillas escapadas y saltos de línea dentro de celdas. El esquema JSON admite respaldos `tedvio-question-bank` versión 1 y listas de objetos con nombres de campo de TEDVIO.

Cada inserción usa una sola petición con el propietario de la sesión, sin IDs de origen. La organización utiliza un UPDATE de campos permitidos, filtrado por propietario e IDs, sujeto al RLS existente. Informa el número de filas realmente devueltas; si alguna dejó de estar disponible no afirma que todas cambiaron. No modifica las copias de preguntas de sesiones o evaluaciones existentes. No requiere migraciones nuevas ni servicios de pago.

No hay borrado masivo. No se encolan escrituras sin conexión ni se reintentan automáticamente. La importación conserva el texto ante errores. Tras una interrupción de red con resultado incierto, actualizar el banco antes de reintentar permite volver a detectar duplicados; no hay garantía de idempotencia entre pestañas concurrentes.

El banco se carga en páginas estables de 500 registros para evitar respaldos truncados por el límite predeterminado de la API. No es una instantánea transaccional si otro cliente modifica el banco durante la lectura. Archivos mayores de 2 MB deben exportarse por selecciones para volver a importarlos.

## Activación anterior

El 22 de septiembre de 2026 se aplicó `safe_academic_deletion` en TEDVIO y se verificaron funciones, `search_path` y permisos (sin ejecución anónima). PR #93 fusionado en `89f6b75`; `/teacher` sirve el índice y CSS de esa versión. No se borraron datos reales. El asesor de seguridad solo reportó la [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) desactivada; no se cambió la configuración de autenticación ni el plan.

## Verificación

- Suite `npm run quality`: tipado, pruebas de dominio, build y contratos de arquitectura, seguridad y recuperación.
- `tests/browser/phase6-bank.spec.mjs`: importación con corrección, revisión, clasificación por lote, exportación, archivo/restauración, duplicados y recuperación tras error, con usuarios y datos sintéticos.
- Regresiones del creador de exámenes/OMR y eliminación segura. La configuración de CI incluye escritorio Chromium e iPhone WebKit; la comprobación local usa Chromium de escritorio y móvil emulado.

Resultado local: 47 pruebas de dominio aprobadas y todos los contratos de `quality`; 4 recorridos del banco, 18 de exámenes/OMR y 12 de eliminación aprobados. El recorrido móvil de publicación detectó que las tablas ensanchaban la página de Calificaciones: se contuvo el ancho y se volvió a verificar ese recorrido con éxito. Las pruebas locales no sustituyen la ejecución WebKit de CI.
