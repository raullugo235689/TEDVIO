# TEDVIO · Protección de producción en GitHub

## Estado administrativo pendiente

La protección efectiva de la rama y el cambio de visibilidad deben realizarse desde la configuración administrativa del repositorio. Este documento define el estado obligatorio antes del piloto externo.

## Repositorio

- Visibilidad recomendada: **Private**.
- Licencia: propietaria.
- Secret scanning y push protection: activados cuando el plan lo permita.
- Dependabot alerts y security updates: activados.

## Ruleset para `main`

Aplicar a la rama predeterminada:

- exigir pull request antes de fusionar;
- una aprobación mínima;
- aprobación de CODEOWNERS para superficies sensibles;
- resolver todas las conversaciones;
- exigir rama actualizada antes de fusionar;
- bloquear force push;
- bloquear eliminación de `main`;
- impedir bypass ordinario de administradores;
- permitir bypass únicamente a la automatización que actualiza el artefacto reproducible;
- exigir commits firmados cuando el flujo de automatización esté preparado para ello.

## Checks obligatorios

Los nombres exactos deben confirmarse después de una ejecución exitosa y configurarse como requeridos:

- TEDVIO 2.0 Frontend Build / quality
- TEDVIO 2.0 Phase 6 Production Cutover / static-cutover
- TEDVIO 2.0 Phase 6 Production Cutover / browser-cutover
- Security Gate
- CodeQL
- TEDVIO Authenticated Launch E2E / static-contract

El recorrido autenticado completo se ejecuta manualmente con un tenant sintético hasta que existan credenciales de CI aisladas. Antes de abrir ventas deberá convertirse en una comprobación requerida de la candidata de lanzamiento.

## Flujo de producción

```text
rama de trabajo
→ pull request
→ revisiones y checks
→ merge controlado a main
→ build reproducible
→ despliegue Vercel
→ smoke de producción
→ ventana de observación
```

## Rollback

- Frontend nuevo: volver al último commit estable de `main` y redeplegar.
- Emergencia docente: `/teacher-legacy` permanece como recuperación temporal.
- Base de datos: toda migración debe ser aditiva o incluir una estrategia explícita de reversión; no se eliminan datos académicos durante un rollback visual.
