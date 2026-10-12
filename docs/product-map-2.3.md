# TEDVIO 2.3 · Mapa de producto y navegación

## Fuente única del menú
`apps/teacher-v2/src/app/navigation.tsx` define cinco áreas con rutas compatibles. `core/navigation-context.ts` define cómo se conserva el grupo entre tareas. Cada función tiene un destino canónico; los accesos contextuales apuntan a él.

| Área | Entrada | Funciones |
|---|---|---|
| Hoy | `/` | Jornada, agenda y Modo Clase |
| Grupos | `/groups` | Padrón, asistencia, justificaciones, registro conjunto, alumnos |
| Biblioteca | `/prepare` | Banco propio y selección de preguntas para una clase |
| Evaluar | `/evaluate` | Exámenes, corrección de hojas, libro y periodos |
| Resultados | `/reports` | Reportes y analítica |

Configuración, soporte y formación personal se mantienen como accesos secundarios. Los enlaces de estudiantes, proyección, exámenes y todas las rutas antiguas permanecen válidos. No se cambian permisos ni se convierte ENARM en contenido compartido.

## Comportamiento
Cinco pestañas móviles; todas las herramientas también están en el botón Más de la cabecera con búsqueda. Iniciar clase no lanza preguntas: abre el flujo existente. Una única sesión real en vivo ofrece Volver a la clase; varias requieren elegir. La barra extra no se muestra dentro del control en vivo. Asistencia tiene navegación secundaria para lista/historial/justificaciones/registro conjunto. Evaluar reúne los pasos de evaluación y Resultados agrupa reportes/analítica.

El contexto es explícito en la URL y se valida contra los grupos del docente, no se guarda como una selección global invisible. El registro conjunto o una selección múltiple nunca aparentan un único grupo. Cambiar de grupo limpia el periodo. Biblioteca comparte el banco propio, no duplica preguntas por grupo. Elegir grupo no escribe datos académicos. El editor de un examen conserva su propio grupo explícito, sin mostrar como definitivo el grupo inicial de su enlace.

Los controles de navegación no forman parte de los documentos impresos: se ocultan en cuadernillos, claves y hojas OMR sin alterar el tamaño ni los centros de las burbujas. La vista general no afirma que exista un grupo seleccionado.

## Validación de esta entrega
Pruebas de contexto y enlaces, continuidad entre áreas, cinco destinos en 320/390/768/1280 px, buscador accesible, modo oscuro, no mutaciones al navegar y regresiones completas Chromium/WebKit. Conserva las comprobaciones transaccionales y publicación verificada de 2.2. No publicar hasta revisar CI, capturas y correspondencia del artefacto.

La revisión de impresión comprueba que los nuevos controles están presentes en pantalla y ocultos al imprimir; mantiene las verificaciones de A4/Carta, QR y geometría OMR. La comprobación de enlaces distingue el logotipo de la opción Hoy, sin retirar ninguna ruta del menú.

## Etapas comerciales todavía no ejecutadas
No se han creado cobros, precios activos, suscripciones, invitaciones, testimonios ni contactos. Siguen propuestas: prueba de árbol con docentes externos, piloto privado de 15 docentes/4 semanas, página comercial y demostración pública, medición de activación/retención, contratación y facturación. Hipótesis de precio: 199 MXN/mes, pendiente de validación y costos, no una oferta vigente. No se afirma que esta reorganización por sí sola valide el mercado.

Carga multicuenta prolongada, respaldo/restauración reales y retención conservan el alcance pendiente de la auditoría 2.2. El diseño premium existente permanece; no se reescribe todo el sistema visual.
