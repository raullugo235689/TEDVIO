# TEDVIO v74 · AI Copilot

## Objetivo

Convertir la evidencia ya registrada en TEDVIO en un **copiloto docente accionable**, no en un chatbot genérico. El flujo esperado es:

**pregunta del profesor → contexto académico mínimo → respuesta fundamentada → evidencia → siguiente acción**.

## Experiencia docente

El Copilot se carga bajo demanda desde **✦ TEDVIO AI** y permite trabajar con todos los grupos o con un grupo concreto. Incluye accesos rápidos para:

- identificar qué necesita atención hoy;
- resumir cómo va el grupo;
- proponer qué conviene repasar en la siguiente clase;
- crear un borrador de reforzamiento con hasta cinco reactivos.

Las respuestas pueden incluir acciones validadas para abrir grupo, calificaciones, OMR, asistencia o generar reforzamiento.

Los reactivos generados **nunca se guardan automáticamente**. El docente los revisa en el Copilot y debe pulsar explícitamente **Guardar en Banco**. Se almacenan en Question Studio bajo la carpeta `TEDVIO AI · Reforzamiento` como borradores académicos normales.

## Arquitectura

### Frontend

`teacher-ai-copilot-v74.js/css` se registra como feature `ai` en `teacher-progressive-boot-v68.js`.

- No se agrega ningún script ni stylesheet al primer render de `teacher.html`.
- El módulo reutiliza `window.__TEDVIO_TEACHER686__` y su sesión autenticada.
- No crea un segundo cliente Supabase.
- No instala polling ni MutationObserver.
- La conversación no se persiste en base de datos.

### Contexto académico

`public.v2_teacher_ai_context(p_group_id uuid)` construye el contexto con `auth.uid()` y permisos normales del usuario.

- Es **SECURITY INVOKER**.
- Solo `authenticated` tiene EXECUTE.
- `anon` y `public` no pueden ejecutarla.
- Puede limitar el contexto a un grupo concreto.
- No incorpora notas libres ni observaciones docentes.

### Backend

`/api/tedvio-ai`:

1. valida el Bearer token contra Supabase Auth;
2. consulta `v2_teacher_ai_context` usando **el JWT del propio profesor**, no service role;
3. valida que el grupo solicitado pertenezca al contexto autorizado;
4. agrega únicamente analítica OMR compacta del examen más reciente;
5. elimina identificadores internos y matrículas del contexto enviado al modelo;
6. solicita una respuesta JSON con schema estricto;
7. valida nuevamente acciones, grupos y reactivos antes de devolverlos al navegador.

## Inferencia

Ruta principal:

- Vercel AI Gateway mediante `AI_GATEWAY_API_KEY` o `VERCEL_OIDC_TOKEN`.
- `openai/gpt-5.6-luna` para consultas cotidianas.
- `openai/gpt-5.6-terra` para generación de reforzamiento.

Respaldo opcional, exclusivamente del lado servidor:

- `OPENAI_API_KEY`, si alguna vez se configura en el deployment.

Ninguna clave de inferencia aparece en el frontend.

## Privacidad y decisión humana

El Copilot recibe solo información académica necesaria para responder. Los nombres de alumnos se incluyen únicamente cuando la consulta requiere seguimiento individual; en otras consultas se sustituyen por referencias genéricas.

Las instrucciones del modelo prohíben:

- inferir o diagnosticar salud, discapacidad, situación socioeconómica, religión, raza u otros atributos sensibles;
- convertir las señales académicas en sanciones automáticas;
- inventar métricas, matrícula o evidencia;
- seguir instrucciones que aparezcan incrustadas dentro de nombres, materias, títulos o datos recuperados.

Las acciones de TEDVIO AI son sugerencias y requieren interacción explícita del docente.

## v73.1 · Workflow smoke

Se agregó `tests/v73-1-teacher-workflow-smoke.mjs` para comprobar la continuidad:

**Inicio → Modo Clase → Asistencia/Live → Grupo → Alumno 360° → Libro → OMR → Assessment Intelligence → reforzamiento**.

Esta auditoría valida integración de código. Una sesión docente autenticada en navegador sigue siendo necesaria para una prueba visual humana completa de datos reales.

## Validación prevista

La auditoría v74 comprueba:

- sintaxis del endpoint, cliente y cargador;
- cero recursos AI en first paint;
- autenticación y contexto con JWT del docente;
- ausencia de service-role y secretos Supabase;
- modelos y Responses API actuales;
- structured outputs;
- acciones allowlisted;
- guardado explícito en Question Studio;
- tema claro/oscuro, móvil y reduced-motion;
- regresiones v68–v73 e iOS/Safari.
