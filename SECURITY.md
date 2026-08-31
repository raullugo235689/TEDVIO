# Política de seguridad de TEDVIO

## Versiones atendidas

Durante el piloto, la versión atendida es la publicada en `/teacher`. La ruta `/teacher-legacy` existe únicamente como mecanismo temporal de recuperación y no debe utilizarse como referencia para nuevas integraciones.

## Cómo reportar una vulnerabilidad

No publiques vulnerabilidades, credenciales, datos personales ni evidencias académicas en un issue público.

Utiliza el Centro de Soporte dentro de TEDVIO y selecciona **Cuenta o seguridad**. Conserva el código de incidente generado por la plataforma. Cuando el acceso a la aplicación no sea posible, utiliza el canal privado de contacto del propietario del repositorio.

Incluye únicamente:

- descripción del comportamiento;
- ruta o módulo afectado;
- pasos mínimos para reproducirlo;
- impacto potencial;
- navegador y sistema operativo;
- código de incidente, cuando exista.

No adjuntes nombres de estudiantes, matrículas, calificaciones, respuestas, tokens, contraseñas ni claves privadas.

## Compromiso de respuesta

Durante el piloto se buscará:

- confirmar recepción en un máximo de 2 días hábiles;
- clasificar la severidad y establecer un plan inicial;
- contener de inmediato cualquier riesgo crítico verificable;
- comunicar la corrección y solicitar una nueva validación cuando proceda.

Los tiempos pueden variar según complejidad, dependencia de proveedores y necesidad de preservar evidencia.

## Investigación autorizada

Se autoriza únicamente la investigación de buena fe que:

- use una cuenta propia o un entorno de demostración;
- no acceda, modifique ni elimine datos ajenos;
- no degrade la disponibilidad del servicio;
- no realice ingeniería social, spam o fuerza bruta;
- no publique el hallazgo antes de coordinar la corrección;
- detenga la prueba en cuanto aparezcan datos no propios.

No se autoriza la extracción masiva, eludir pagos, acceder a cuentas de terceros, revelar secretos ni intentar comprometer proveedores externos.

## Alcance técnico prioritario

Se consideran especialmente sensibles:

- autenticación y recuperación de cuenta;
- aislamiento entre docentes e instituciones;
- políticas RLS y funciones privilegiadas;
- calificaciones, OMR, periodos y fotografías académicas;
- carga de archivos y reportes;
- service worker, caché y rutas de rollback;
- secretos de GitHub, Supabase y Vercel.

## Gestión interna

Cada hallazgo confirmado debe registrar severidad, responsable, causa raíz, corrección, pruebas, fecha de despliegue y decisión de divulgación. Las credenciales expuestas deben revocarse, no solamente ocultarse del historial visible.
