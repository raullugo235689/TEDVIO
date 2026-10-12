# Corrección del bloqueo de publicación de TEDVIO 2.2

## Diagnóstico reproducido
El commit 098b9d98b20802a481e1a57c337d2a67847e1a69 pasa la validación íntegra tanto en Node 22 local como en Node 24 aislado (workflow 38269416839). El despliegue productivo fallaba al comparar los bytes de la configuración.

Se ejecutaron pruebas aisladas de Vercel que finalizan deliberadamente con códigos de diagnóstico, sin publicar una aplicación ni cambiar el dominio productivo. El despliegue dpl_7hvi9avNj1dWSfmZjWV7CktZrzsB confirmó con código 82 que la configuración completa mantiene exactamente los mismos valores JSON pero cambia su representación textual. Una prueba previa restaurando los bytes originales hizo pasar la validación del paquete (código diagnóstico 51, dpl_7p6TKrcpnZz6fwhjQoXRuKCjaKrM).

## Corrección
Normalizar únicamente vercel.json antes de calcular su huella: ordenar claves de objetos y serializar JSON. Se conservan todos los valores y el orden de todos los arreglos. Los demás archivos fuente y los tres paquetes compilados siguen verificándose byte por byte. No se elimina ninguna comprobación, no se altera buildCommand y no se reconstruye/atesta en Vercel.

Se agregan pruebas de formato y orden de claves, además de rechazos de cambios en buildCommand, encabezados CSP y orden de rewrites. Las seis pruebas de integridad aprobaron localmente. El pipeline debe volver a construir y validar el paquete completo antes de integrarlo y publicarlo.

Sin modificaciones a alumnos, listas, faltas, base de datos, políticas académicas, permisos de usuarios ni planes de pago. Las ramas de diagnóstico nunca deben integrarse: este cambio parte de la versión principal limpia.
