## Propósito

Describe el problema, el resultado esperado y la razón para modificar producción.

## Alcance

- [ ] El cambio pertenece al alcance publicado de TEDVIO 1.0.
- [ ] No agrega una segunda fuente de verdad ni una capa heredada.
- [ ] No contiene secretos, `service_role` ni datos académicos reales.
- [ ] No introduce IA generativa ni costos por tokens sin aprobación explícita.

## Datos y seguridad

- [ ] Las operaciones están aisladas por usuario/institución.
- [ ] Las migraciones utilizan RLS y privilegio mínimo.
- [ ] No existe eliminación física de evidencia académica sin procedimiento formal.
- [ ] Los cambios sensibles tienen trazabilidad o revisión.
- [ ] Se ejecutó el Security Advisor después de cualquier DDL.

## Calidad

- [ ] TypeScript.
- [ ] Auditoría arquitectónica.
- [ ] Auditoría de seguridad.
- [ ] Preparación de lanzamiento.
- [ ] Build reproducible.
- [ ] Prueba en Chromium.
- [ ] Prueba en WebKit/iPhone cuando cambia la experiencia visual.
- [ ] Sin errores nuevos de consola.

## Evidencia

Incluye capturas, resultados de pruebas, migraciones aplicadas y plan de rollback.

## Riesgo y rollback

Explica qué puede fallar, cómo detectarlo y qué commit/ruta permite volver al estado anterior.
