# TEDVIO · Programa de preparación para lanzamiento

## Estado ejecutivo

TEDVIO 2.0 ya es una aplicación docente unificada y funcional. El frontend principal opera en `/teacher`, conserva `/teacher-legacy` como rollback temporal y cubre el ciclo académico desde grupos y asistencia hasta evaluación, OMR, libro, Alumno 360°, periodos y reportes.

La siguiente etapa no consiste en añadir módulos por volumen. Consiste en convertir una plataforma técnicamente completa en un producto verificable, observable, fácil de adoptar y listo para un lanzamiento comercial controlado.

## Evaluación de partida

| Dimensión | Estado inicial |
|---|---:|
| Propuesta de valor | 9.6/10 |
| Cobertura funcional | 9.0/10 |
| Arquitectura del frontend | 8.6/10 |
| Protección y trazabilidad académica | 8.7/10 |
| Experiencia y consistencia visual | 7.8/10 |
| Rendimiento percibido | 7.6/10 |
| Pruebas de flujos reales | 7.0/10 |
| Observabilidad y soporte | 5.8/10 |
| Validación con mercado | 3.5/10 |
| Preparación comercial | 6.7/10 |

**Conclusión:** listo para piloto controlado; todavía no listo para lanzamiento masivo de pago.

## Principios permanentes

- Un solo `AppShell`, router y cliente Supabase.
- No volver a crear capas históricas por versión.
- Ningún dato académico se elimina físicamente sin una política explícita.
- Toda corrección de calificaciones, OMR, periodos u observaciones conserva trazabilidad.
- Sin IA generativa ni costo por tokens como dependencia obligatoria.
- Toda entrega debe pasar TypeScript, pruebas unitarias, auditoría arquitectónica, pruebas de navegador y despliegue de vista previa.
- Producción se modifica únicamente mediante PR validado y rollback disponible.

# Fase 7 · Launch Hardening

## 7.0 · Verdad del producto y limpieza postmigración — P0

- Eliminar textos que todavía dicen “en migración”, “Fase 2”, “reconstrucción” o “se migrará”.
- Retirar componentes y carpetas muertas de migración.
- Corregir o retirar `LegacyBridge`; nunca debe redirigir de `/teacher` hacia `/teacher`.
- Sustituir etiquetas técnicas como “PRODUCCIÓN UNIFICADA” y “Frontend principal” por lenguaje orientado al docente.
- Definir si Tareas forma parte del alcance de lanzamiento; migrarla o excluirla explícitamente de la oferta.
- Cerrar PR heredados que ya fueron sustituidos por TEDVIO 2.0.

**Criterio de salida:** ninguna pantalla de producción contiene lenguaje de construcción, migración o rollback salvo una sección de soporte deliberada.

## 7.1 · Observabilidad, soporte y recuperación — P0

- Integrar telemetría propia usando `tedvio_client_events`.
- Registrar errores globales, errores de consulta, ruta, versión y contexto no sensible.
- Incorporar “Reportar un problema” usando `tedvio_support_reports`.
- Añadir indicadores de conexión, reintento y estado de sincronización.
- Crear límites de error por ruta y acciones de recuperación sin perder formularios.
- Conectar el proyecto correcto de Vercel para consultar runtime logs y despliegues.
- Definir tablero de incidentes P0/P1/P2 y tiempo objetivo de respuesta.

**Criterio de salida:** todo error crítico de producción puede detectarse, localizarse y reproducirse sin depender únicamente de una captura del usuario.

## 7.2 · Pruebas de producto real — P0

- Incorporar Vitest para cálculos y máquinas de estado.
- Probar: asistencia, ponderaciones, promedios, cierre/reapertura, OMR y normalización de escalas.
- Crear tenant, profesor, grupos y alumnos sintéticos para CI.
- Añadir Playwright autenticado para recorridos completos.
- Probar Chromium, WebKit, iPhone y escritorio.
- Añadir pruebas de accesibilidad automatizadas con axe.
- Añadir presupuestos de tamaño de bundle y regresión visual básica.

Recorridos mínimos:

1. Cuenta → onboarding → grupo → importación de alumnos.
2. Grupo → asistencia → guardar → cerrar → reabrir.
3. Banco → evaluación → versiones → OMR → revisión → libro.
4. Libro → periodo → cierre → Alumno 360° → reporte.
5. Modo Clase → pregunta → respuesta → revelar → cerrar.

**Criterio de salida:** 100% de recorridos críticos exitosos sobre datos sintéticos, sin modificaciones a datos reales.

## 7.3 · Rendimiento y sistema visual — P1

- Carga diferida por ruta con `React.lazy` y `Suspense`.
- Separar OMR, Libro, Alumno 360° y Configuración del bundle inicial.
- Sustituir CSS nombrado por fases por tokens, componentes y estilos de feature.
- Dividir páginas monolíticas en componentes, hooks y servicios.
- Virtualizar matrices grandes del Libro y listados extensos.
- Skeletons locales, estados vacíos claros y guardado optimista controlado.
- Medir LCP, INP y CLS mediante telemetría propia.

Presupuestos iniciales:

- JavaScript inicial comprimido: ≤ 250 KB.
- CSS inicial comprimido: ≤ 45 KB.
- CLS p75: < 0.10.
- INP p75: < 200 ms.
- LCP p75: < 2.5 s en móvil razonable.

## 7.4 · Acceso, seguridad y cumplimiento — P0/P1

- Recuperación de contraseña y reenvío de confirmación.
- Política de contraseña más fuerte y protección de contraseñas filtradas.
- Consentimiento legal explícito al crear cuenta.
- Convertir CSP de report-only a aplicada después de validar reportes.
- Auditoría de dependencias y secretos en CI.
- Repositorio privado o estrategia explícita de licencia y propiedad intelectual.
- Protección de `main`, revisiones obligatorias y checks requeridos.
- Prueba documentada de respaldo y restauración.
- Revisión jurídica de privacidad, términos y tratamiento de datos educativos.

**Criterio de salida:** cero hallazgos críticos/altos abiertos y recuperación de acceso validada de extremo a extremo.

## 7.5 · Onboarding y piloto — P0

- Reutilizar `tedvio_onboarding_progress` para una guía medible.
- Recorrido inicial: institución → grupo → alumnos → primera asistencia → primera sesión.
- Espacio demo reiniciable, separado de datos reales.
- Checklist de activación visible y ayuda contextual.
- Piloto con 10–15 docentes y al menos 300 estudiantes durante 2–4 semanas.
- Canal de feedback dentro del producto.

Métricas de piloto:

- Activación: crea grupo + importa alumnos + registra primera evidencia.
- Tiempo a primera lista: objetivo < 10 minutos.
- Finalización de onboarding: objetivo ≥ 80%.
- Retención semanal docente: objetivo inicial ≥ 70%.
- Sesiones sin error crítico: objetivo ≥ 99%.
- Al menos 5 evaluaciones completas Banco → OMR → Libro.
- Cero pérdida de datos confirmada.

## 7.6 · Preparación comercial — P1/P2

- Landing pública en `/` en lugar de un redireccionamiento inmediato.
- Dominio propio, correo de soporte y páginas de contacto.
- Demostración guiada y material de capacitación.
- Planes, límites y prueba gratuita claramente definidos.
- Invitaciones institucionales, roles y administración de licencias.
- Facturación y proveedor de pagos solo después de validar disposición a pagar.
- Política de soporte, estado del servicio, changelog y documentación.
- Marca, nombre, dominio y propiedad intelectual revisados.

## 7.7 · Puerta de lanzamiento

TEDVIO podrá realizar un lanzamiento comercial controlado cuando cumpla simultáneamente:

- Cero defectos P0 y máximo tres P1 con solución programada.
- Todos los flujos críticos autenticados en verde.
- Accesibilidad sin violaciones críticas.
- Métricas móviles dentro de los presupuestos acordados.
- Protección de contraseña filtrada activa y CSP aplicada.
- Respaldo y rollback verificados.
- 10 o más docentes activos reales.
- Retención semanal y finalización de onboarding dentro de objetivo.
- Evaluación/OMR/Libro validados en uso real.
- Documentos legales, soporte y dominio público disponibles.

# Orden de ejecución

1. **Sprint 1:** verdad del producto, observabilidad, soporte, acceso y CI autenticado.
2. **Sprint 2:** rendimiento, accesibilidad, modularización y trabajo sin conexión para asistencia.
3. **Sprint 3:** onboarding medible, demo reiniciable y piloto docente.
4. **Sprint 4:** landing, dominio, planes, documentación y lanzamiento controlado.

# Decisión de producto

Hasta superar la puerta de lanzamiento se congela la incorporación de grandes módulos nuevos. Las únicas funciones nuevas permitidas serán las que reduzcan riesgo, mejoren activación, resuelvan feedback del piloto o completen una promesa comercial ya comunicada.
