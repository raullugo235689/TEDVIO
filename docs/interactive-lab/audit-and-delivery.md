# Interactive Lab · Entrega incremental 01

Estado: **en desarrollo, sin despliegue ni migración en producción**. No anunciar como módulo disponible.
Base inspeccionada: `b64c49be0c1f5b438c30cc4bccd333425ec5646f` (TEDVIO 2.3.0). Rama `feature/interactive-lab-foundations`.

## Diagnóstico verificado
- Frontend canónico React/TypeScript/Vite en `apps/teacher-v2`; navegación 2.3 y API Supabase existentes. Reutilizar su autenticación docente, componentes, contexto de grupo y publicación verificada.
- El documento `PRODUCT-SCOPE-1.0.md` excluye Tareas asincrónicas del lanzamiento. Existen tablas/RPC históricas `v2_assignments`, pero no se rehabilitan ni se presentan como un flujo validado.
- Padrón canónico: `v2_group_students` (id, group_id, teacher_id, enrollment, full_name, active). No tiene enlace de cuenta de alumno. `v2_roster_students` y los tokens de sesiones anteriores no son una identidad global verificada.
- Instituciones: grupos → programas → universidades → institución opcional, más membresía institucional activa. Perfiles docentes tienen roles teacher/institution_admin/admin y estados active/suspended.
- Libro existente: `v2_grade_items`/`v2_grade_scores`, políticas y RPC propios; los tipos de origen están restringidos. Este incremento no altera esos contratos ni escribe calificaciones.
- Se consultó exclusivamente metadato SQL de producción, sin descargar el padrón ni ejecutar pruebas sobre datos reales.
- La conexión Vercel reconoce el equipo, pero las lecturas del alias y del proyecto conocidos devolvieron 404. No se verificó el despliegue actual por esa conexión; este error no demuestra una caída de la aplicación.

## Implementado en esta rama
1. Migración aditiva generada mediante `supabase@3.0.0 migration new interactive_lab_foundation` en workflow aislado 42251649145, después desarrollada y probada localmente. **No aplicada a producción**.
2. Actividades y versiones inmutables, manifiesto público separado de clave privada, recursos en cuarentena sin permiso de importación/ejecución todavía, asignaciones y referencias a alumnos existentes, intentos, respuestas y auditoría.
3. RPC de creación, publicación, asignación por varios grupos, emisión/revocación de acceso personal, inicio, entrega, recibo y consulta docente paginada. Ninguna tabla admite escritura directa del cliente.
4. Evaluadores `answer-key-v1` (opción y número con tolerancia) y `review-required-v1` (provisional, sin nota automática). Fechas, duración, cuota de intentos y selección primero/último/mejor se resuelven en servidor.
5. SDK `tedvio.lab/1`: contexto exacto, MessageChannel dedicado, límites de mensajes, reintento con el mismo identificador y confirmación solo con recibo válido.
6. Adaptador TypeScript nativo que reutiliza el cliente docente y un cliente estudiantil aislado sin sesión persistente. Todavía no se añade ruta o menú a producción.
7. Ejemplo de actividad HTML, manifiesto y clave sintéticos, documentación del contrato y pruebas. No es el Atlas anatómico ni una maqueta presentada como producto terminado.

## Identidad y seguridad
La matrícula no acredita identidad. El docente debe verificar al destinatario y entregar individualmente una credencial aleatoria de alta entropía. El servidor guarda su huella, limita el alcance a un destinatario/asignación y permite rotarla o revocarla. No se distribuye una clave común a un grupo.
Esta credencial prueba posesión después de su entrega; **no impide que un alumno la comparta ni sustituye verificación institucional**. El flujo visual de verificación, entrega y recuperación es un requisito pendiente antes del piloto. Los tokens no deben ponerse en query strings, registros ni HTML importado. El adaptador los conserva solo en la memoria del host confiable.
El acceso al recibo dura hasta 30 días después del cierre como política inicial explícita, pendiente de revisión antes de lanzamiento. La entrega permanece bloqueada por el cierre/duración; un recibo idempotente se puede recuperar sin crear otra entrega. No existe aún una cuenta estudiantil persistente entre asignaciones.
Los docentes suspendidos o sin membresía institucional activa no pueden usar los nuevos datos correspondientes. RLS también protege consultas directas, no solo RPC. Claves y hashes de acceso están en esquema privado.

## Qué prueban los ensayos
- Tests SQL: motor PostgreSQL embebido PGlite con disco temporal, esquema mínimo compatible con los objetos inspeccionados, dos docentes y alumnos sintéticos. Comprueba persistencia tras reiniciar, aislamiento, suspensión/revocación, puntuación, versiones, reintentos, rollback y fechas.
- Tests SDK: contrato, origen/ventana de bootstrap, contexto y canal, rechazo de recibos inválidos y respuestas manipuladas; una prueba conecta SDK → RPC SQL real → resultado consultado por docente mediante transporte Window sintético.
- Fixture de navegador: evalúa iframe/CSP/MessageChannel en 390/1280 px. Su callback de recibo es **sintético** y no demuestra un envío HTTP a Supabase ni el panel docente. No confundirlo con el ensayo de persistencia SQL.
- El navegador local bloqueó HTTP loopback por política del entorno. La ejecución automatizada Chromium/WebKit se prepara en CI; sus resultados se informan separadamente, nunca se suponen aprobados.
- No se ensayaron múltiples conexiones PostgreSQL concurrentes para este módulo, 150 estudiantes reales, recuperación de producción, ni toda la cadena visual del producto.

## Estado respecto al encargo completo
| Fase | Estado de esta entrega |
|---|---|
| Auditoría | Código y esquema inspeccionados; despliegue no verificable con la conexión actual. |
| Infraestructura | Primer contrato, RPC, permisos, SDK y pruebas; revisión de carga, límites de API e integración con el esquema completo todavía pendientes. |
| Panel docente | Adaptador API preparado; biblioteca visual, editor, versiones/borradores, asignaciones y centro de resultados pendientes. |
| Experiencia estudiantil | Backend y SDK; host nativo, entrega de accesos, recuperación visual y pruebas integrales pendientes. |
| Importación HTML | Solo metadatos de cuarentena. Importación de ZIP, límites descomprimidos, análisis de rutas, recursos y servidor de origen aislado pendientes. No se ejecuta HTML importado. |
| Calificaciones | No se publica automáticamente ninguna nota; vínculo trazable y revisión docente pendientes. |
| Atlas | Pendientes imágenes anterior/lateral y delimitaciones revisadas por el docente. No se inventan músculos ni regiones. |
| Piloto/despliegue | Pendientes autorización de impacto y criterios integrales; no se modifica main ni producción. |

No se han terminado las exportaciones Excel/CSV de la interfaz: se aporta únicamente escape seguro de celdas en el SDK. Tampoco revisión manual de resultados, comparación de grupos, promedios del panel, ni corrección de etiquetas/polígonos del Atlas.

## Próxima entrega delimitada
Construir un recorrido nativo completo de una plantilla revisada: biblioteca docente → asignación a padrón existente → acceso personal → host estudiantil → recibo persistido → panel docente → CSV. Después extender a paquetes HTML en cuarentena y Atlas. Las cinco áreas actuales deben conservarse: entrada de Interactive Lab visible en Biblioteca y acceso contextual desde Evaluar/Resultados, sin duplicar módulos. La ubicación definitiva se revisa con el propietario antes de publicar.

## Insumos del piloto aún no recibidos
El encargo propone Odontología 1-A 38, 1-B 36, 1-C 40 y 1-D 36 (150), pero no se han importado ni verificado esos alumnos. Se requieren las imágenes y el archivo autorizado de matrícula/nombre, reconciliándolo con el padrón existente. Taxonomía a conservar: orbitarios, nasales, orales superiores e inferiores, platisma, occipitofrontal, auriculares y masticación como módulo específico.

## Revisión y publicación
No fusionar este primer incremento como si fuera el producto completo. Antes de habilitarlo: restauración de todas las migraciones en entorno aislado, concurrencia multiusuario, prueba de HTTP/PostgREST/JWT real, integración de permisos del plan, límites/rate limiting, política de credenciales, importador y origen de ejecución, pruebas nativas en ambos navegadores, exportación, autorización del propietario. Nunca deshabilitar la verificación del paquete para publicarlo.
