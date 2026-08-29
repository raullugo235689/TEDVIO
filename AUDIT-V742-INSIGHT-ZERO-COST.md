# TEDVIO v74.2 · Insight Zero Cost

## Decisión de producto

TEDVIO retira la inferencia generativa del flujo docente principal. La plataforma conserva análisis y recomendaciones académicas mediante reglas determinísticas, datos autorizados y el Banco de Reactivos.

**No se utiliza AI Gateway, OpenAI, modelos externos ni créditos por tokens.**

## Flujo

**pregunta docente → contexto académico autorizado → reglas transparentes → evidencia → siguiente acción**

TEDVIO Insight puede interpretar solicitudes sobre:

- estado general del grupo;
- asistencia y listas pendientes;
- rendimiento disponible;
- suficiencia de evidencia;
- señales académicas de riesgo o seguimiento;
- contenido débil en OMR;
- reforzamiento a partir de reactivos existentes en Question Studio.

## Reforzamiento

TEDVIO Insight no genera preguntas nuevas. Cuando existe un contenido débil mapeado en OMR:

1. identifica el tema con menor dominio;
2. consulta el Banco de Reactivos del propio docente;
3. selecciona hasta cinco reactivos compatibles ya existentes;
4. muestra los reactivos como opciones de reforzamiento;
5. permite abrir Question Studio para revisarlos o utilizarlos.

Si no existen reactivos compatibles, TEDVIO lo indica y dirige al Banco para crear o etiquetar material.

## Suficiencia de evidencia

Insight distingue entre ausencia de riesgo y ausencia de evidencia. La interfaz presenta por separado:

- asistencia: sin evidencia, preliminar o con evidencia;
- rendimiento: sin evidencia o con evidencia;
- riesgo combinado: no evaluable, parcial o evaluable;
- OMR: sin resultados o con evidencia.

Por ejemplo, `0 alumnos en riesgo` no se interpreta como `grupo sin riesgo` si todavía faltan suficientes listas o calificaciones.

## Privacidad

El endpoint conserva autenticación mediante el JWT del profesor y el RPC `v2_teacher_ai_context`, cuyo nombre se mantiene por compatibilidad interna.

- El RPC es SECURITY INVOKER.
- Solo el rol `authenticated` tiene EXECUTE.
- No se utiliza service role.
- Las notas libres y observaciones docentes no forman parte del contexto.
- Los nombres de estudiantes solo se incluyen cuando la pregunta pide explícitamente alumnos o nombres individuales.

## Costo

El endpoint heredado `/api/tedvio-ai` se mantiene únicamente para compatibilidad de caché, pero ahora es **local-only**.

El código no contiene:

- `AI_GATEWAY_API_KEY`;
- `VERCEL_OIDC_TOKEN` para inferencia;
- `OPENAI_API_KEY`;
- endpoints de OpenAI o AI Gateway;
- modelos GPT;
- structured outputs de un proveedor externo.

Toda respuesta v74.2 reporta:

- `mode: insight`;
- `provider: local-rules`;
- `generative_ai: false`;
- `inference_cost: 0`.

## Rendimiento

`teacher-insight-v742.js/css` permanece lazy. No agrega recursos al primer render de `teacher.html` y solo se descarga al pulsar **TEDVIO Insight**.

## Compatibilidad

El shim legado `tv74OpenAI` abre TEDVIO Insight para evitar que una página antigua intente invocar la función generativa anterior. Incluso si un cliente en caché llama al endpoint legado, este ya no tiene ninguna ruta de inferencia externa.
