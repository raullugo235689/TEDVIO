# TEDVIO v73 · Assessment Intelligence

## Objetivo

Convertir los resultados OMR en información útil para decidir **qué reactivos revisar, qué contenidos reforzar y si las versiones del examen se comportan de manera descriptivamente similar**, sin modificar las calificaciones ya registradas.

## Indicadores implementados

- Porcentaje de respuestas correctas por reactivo (dificultad).
- Discriminación mediante correlación reactivo–puntaje corregida.
- Consistencia interna del examen mediante alfa para reactivos dicotómicos (equivalente a KR-20 bajo estas condiciones).
- Porcentaje de respuestas en blanco.
- Funcionamiento descriptivo de distractores por versión.
- Detección de distractor dominante.
- Comparación descriptiva de promedio y aprobación entre versiones.
- Brecha de dificultad entre versiones por posición de reactivo cuando existe muestra suficiente.
- Distribución de calificaciones, promedio, mediana, desviación estándar y aprobación.

## Umbrales de prudencia

- Discriminación y consistencia se muestran únicamente a partir de 8 respuestas.
- Comparación por reactivo entre versiones requiere al menos 5 respuestas por versión.
- Con menos de 20 resultados la consistencia se etiqueta como lectura preliminar.
- Las diferencias entre versiones son señales descriptivas; TEDVIO no las presenta como pruebas de significancia estadística.

## Revisión de reactivos

TEDVIO prioriza reactivos con señales como:

- discriminación negativa;
- discriminación baja;
- dificultad extrema;
- porcentaje elevado de respuestas en blanco;
- distractores poco funcionales;
- distractor dominante;
- brecha amplia entre versiones.

El docente puede excluir un reactivo de la **lectura diagnóstica**. Esta acción se almacena en `question_metadata` y **no recalcula ni modifica la calificación de ningún alumno**.

## Mapa de contenidos

El examen puede etiquetarse por rangos, por ejemplo:

`1-10 | Neurocráneo`

`11-20 | Osteogénesis`

Con estas etiquetas TEDVIO calcula dominio por tema y construye una propuesta de reforzamiento. Las etiquetas se comparten por número de reactivo entre versiones, por lo que se muestra una advertencia cuando las versiones reordenan preguntas.

## Arquitectura y seguridad

- v73 se carga únicamente cuando el profesor abre OMR.
- No aumenta los recursos de la primera carga docente.
- Reutiliza el cliente autenticado de Teacher Core.
- Todas las consultas se filtran por `teacher_id` y examen/grupo correspondiente.
- No incluye polling ni observadores de DOM.
- La migración es aditiva: una columna JSONB `question_metadata` en `v2_paper_exams`.
- No modifica `v2_paper_exam_results` salvo por las funciones OMR preexistentes; v73 solo lee esos resultados.

## Validación

- Prueba matemática local con un conjunto sintético de resultados.
- Auditoría v73 propia.
- Regresiones de rendimiento demand-driven, Teacher Core, tema, móvil, exportación, v70, v71, v72 e iOS/Safari.
