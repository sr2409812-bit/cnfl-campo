# Auditoría operativa de CNFL Campo

Fecha: 2026-11-01 (Costa Rica). Base de código: `main` en `abb490aa13c24c4ac2bd9be9609c24c72b49bfc4`.

## Hechos verificados

| Flujo | Evidencia en el repositorio | Resultado de esta revisión |
| --- | --- | --- |
| Inicio y jornada | `campo.html`, `journey.js`, `campo-shell.js` | La jornada sigue carga → mapa → trabajo → reporte. El cierre ahora exige confirmación también en el modelo de datos. |
| Carga de órdenes | `app.js`, `lectura-pdf-v4.js`, pruebas de importación | La revisión previa al guardado y el rechazo de conflictos tienen pruebas locales. No se usaron PDF institucionales reales en esta auditoría. |
| Ruta y mapa | `mapa.js`, `route-preview.js`, `VRS-OS.md` | Las pruebas cubren separación de módulos, GPS ausente o conflictivo y fallos de OSRM. No certifican seguridad vial ni rutas de motocicleta. |
| Gestión y cierre | `campo-shell.js`, `cuts-liquidation.js`, pruebas de cierre | La app resume resultados y pendientes; la casilla de reporte es una declaración del técnico, no constancia de entrega externa. |
| Respaldo | `backup.js`, `data-store.js` | El respaldo v2 toma `items` como estado actual, rechaza estructuras esenciales dañadas y no recupera claves obsoletas de IndexedDB. |
| Sin conexión | `campo.html`, `sw.js` | El inicio registra el worker. Si falta un archivo propio, el worker nuevo no se activa. La limpieza de cachés se limita a CNFL Campo. |
| Publicación | `.github/workflows/verify.yml` | Se añadió una prueba automática en PR y en `main`. Antes no había un flujo de CI en el repositorio. |
| Servidor local | `server.js` | Se comprobó lectura fuera del proyecto con `/../`; ahora solo sirve archivos públicos de la raíz y escucha en loopback por defecto. |

La página publicada `https://sr2409812-bit.github.io/cnfl-campo/campo.html` respondió HTTP 200 con el título «CNFL Campo · Mi jornada» durante esta revisión. Eso verifica disponibilidad de esa página, no el funcionamiento completo del sitio. La versión modificada de esta rama todavía no está publicada.

La línea base pasó 67 pruebas. Después de los cambios, `node --test` pasó las pruebas de regresión. En un navegador Edge local aislado se verificaron: instalación de la caché, apertura de `campo.html` sin red, eliminación de una clave obsoleta de IndexedDB y rechazo de un respaldo con órdenes de estructura inválida. Esas pruebas no equivalen a una operación en un teléfono de campo ni a una prueba en la página publicada.

## Riesgos y límites actuales

1. **Datos locales:** órdenes, progreso y respaldos viven en el navegador. No hay sincronización central ni recuperación automática si se pierde o borra el perfil. Antes de cambiar de equipo o navegador, el técnico debe descargar un respaldo y comprobar la restauración.
2. **Ruteo externo:** `VRS-OS.md` documenta que el OSRM público no certifica exclusión vial, perfil de motocicleta ni tráfico. Las coordenadas se envían a ese servicio cuando se pide una ruta. La ruta sugerida sigue siendo un borrador operativo sujeto a revisión humana.
3. **Modo sin conexión parcial:** los archivos propios se precargan, pero Leaflet, PDF.js y Font Awesome se solicitan a CDN externos como dependencias opcionales. Un primer uso sin red o un fallo de esos proveedores puede dejar el mapa o el lector PDF sin funcionar. El inicio y los datos guardados sí pueden abrirse con la caché instalada.
4. **Fuente monetaria:** el repositorio contiene lógica de liquidación, pero no se consultó Finanzas Globales. `SOURCE_NOT_CONNECTED` para validar importes, reglas de pago o conciliación institucional. Las pruebas verifican cálculo y presentación del código, no autoridad monetaria.
5. **Entrega externa:** compartir un reporte abre mecanismos del dispositivo; la app no recibe un acuse de entrega. La casilla de confirmación registra lo indicado por el usuario.

## Decisiones implementadas en esta rama

- Conservar la arquitectura local actual y reducir pérdida o resurrección accidental de datos.
- Bloquear transiciones de jornada fuera de secuencia y cierres sin confirmación.
- Exigir una caché básica completa antes de activar una versión nueva.
- Ejecutar pruebas de regresión en cada PR y en `main`.

La solicitud del usuario autoriza la auditoría y el fortalecimiento del código. No se ha aprobado ni realizado un cambio de motor vial institucional, una integración con Finanzas Globales ni la publicación de esta rama.

## Comprobación antes de publicar y usar en campo

1. Revisar el PR y confirmar que CI pasa en GitHub. Las pruebas locales son evidencia del código, no de la publicación.
2. En un navegador de prueba, cargar un PDF de cada tipo, confirmar órdenes, armar una ruta, registrar un resultado y cerrar el reporte. Verificar que los pendientes quedan visibles.
3. Descargar un respaldo, restaurarlo en otro perfil de prueba y comprobar cantidades y un resultado concreto. Usar datos de prueba autorizados.
4. Abrir la versión nueva con red, cerrar la página, desconectar la red y comprobar que `campo.html` y las pantallas necesarias abren con el contenido esperado. Probar el mapa y PDF por separado; la caché de archivos propios no garantiza sus dependencias externas.
5. Tras publicar, confirmar la versión servida por GitHub Pages, repetir el recorrido en el dispositivo objetivo y registrar el resultado observable. Si falla, volver al commit anterior y conservar el respaldo del dispositivo.

## Propuestas pendientes

- Sustituir el OSRM público por un servicio autorizado con reglas de moto verificables antes de certificar rutas.
- Empaquetar o alojar bajo el mismo origen las dependencias externas indispensables para uso sin conexión.
- Definir un respaldo institucional verificable y una política de retención; los datos del navegador siguen siendo un punto único de falla.
- Crear una prueba de extremo a extremo en el dispositivo objetivo con PDF y rutas representativos, sin confundirla con las pruebas unitarias.
