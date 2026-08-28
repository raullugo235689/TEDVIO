# TEDVIO v74.1 · AI Copilot Reliability

## Motivo

La primera consulta real del Copiloto abrió correctamente la interfaz y el contexto del grupo, pero el proveedor generativo devolvió un error. El contexto académico de Supabase fue validado de forma independiente con el rol `authenticated`, por lo que el fallo se aisló en la capa de inferencia.

## Correcciones

- Vercel OIDC se intenta antes que una clave manual de AI Gateway.
- Las llamadas de inferencia tienen un límite de 25 segundos para conservar margen de respuesta dentro de la función de 30 segundos.
- Los errores de autenticación, cuota, modelo, formato, tiempo e indisponibilidad quedan clasificados sin exponer secretos.
- OpenAI directo solo puede activarse con `TEDVIO_AI_ALLOW_DIRECT_OPENAI=true`; tener una clave configurada por accidente no habilita gasto directo.
- `TEDVIO_AI_FORCE_LOCAL=true` permite apagar la inferencia sin apagar TEDVIO.
- Cuando AI Gateway no está disponible, el endpoint devuelve un análisis académico local útil en vez de un error genérico.

## Modo local transparente

El fallback:

- utiliza exclusivamente el contexto académico ya autorizado;
- recomienda acciones según asistencia, riesgo, calificaciones y OMR;
- no genera reactivos ni pretende ser inferencia generativa;
- aparece como `TEDVIO Insight · modo local`;
- incluye `degraded: true` y un código diagnóstico seguro;
- informa que no consumió créditos de IA.

El contexto, la autenticación, RLS y la minimización de datos permanecen sin cambios.
