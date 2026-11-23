# M10 · Capa 2 — Captura de finalizaciones detrás del interruptor

**Autorización del propietario (2026-11-23):** preparar la capa 2 de la integración por capas (decisión 0004). **No autorizado en esta entrega:** un control para encender la medición, encenderla en el teléfono, GPS, cronómetro visible, panel de estadísticas.

## Qué entra
1. **Captura de M10-003** (PR #49), traída sobre `main` sin conflictos: `operational-events.js`, los puntos de captura en los cuatro módulos y el mapa, sus pruebas y su documento (`docs/m10-003-module-events.md`).
2. **Puerta del interruptor:** `captureTransition()` no hace nada si el interruptor "Medir tiempos" está apagado, si su script no está cargado o si su valor está dañado. Se revisa dos veces: al llamar y otra vez dentro del bloqueo de escritura, por si se apagó mientras esperaba.
3. **Carga en las páginas:** `index.html`, `lectura.html`, `lectura-residencial.html`, `notificaciones.html` y `mapa.html` cargan, en este orden, `operational-capture-switch.js`, `operational-stats.js` y `operational-events.js`, después de `journey.js` y antes de `campo-shell.js`.
4. **Service worker:** los tres scripts entran en `CORE_ASSETS` y `CACHE_NAME` pasa de `cnfl-campo-v72` a `cnfl-campo-v73`. Esto resuelve el bloqueo 3 de la auditoría de compatibilidad (captura que fallaba la primera vez sin señal).
5. **Versiones `?v=`:** los scripts modificados (`app.js`, `lectura.js`, `lectura-ux.js`, `mapa-data.js`) y los nuevos usan `20261123-m10-capa2`. Con esto `lectura-ux.js` queda con la misma versión en las dos páginas de lectura.

## Puntos de captura
| Módulo | Función | Archivo |
|---|---|---|
| Cortes | `setOrderStatus` | `app.js` |
| Cortes desde el mapa | `setCutStatus` | `mapa-data.js` |
| Demanda | `markCurrentReading` | `lectura.js` |
| Residencial / reapertura | `markCurrentVisit`, `editSavedReading` | `lectura-ux.js` |
| Notificaciones | `markDone`, `undoLastVisit` | `notificaciones.html` |

La captura se llama **después** de guardar el estado real y su resultado nunca se usa: si falla o está apagada, la gestión sigue igual.

## Efecto en el teléfono con el interruptor apagado (estado por defecto)
- Se descargan tres scripts más (precargados para uso sin señal).
- **No se lee ni escribe ninguna clave de medición, no se genera el secreto y no se toca ningún dato de órdenes.**
- No hay ningún control para encender la medición: eso llega en la capa 4.

## Riesgos
- **Service worker:** al publicar, los teléfonos descargan la caché v73. Recomendado: abrir la app con señal y cerrarla y abrirla una vez.
- **Handlers de estado:** se agregan llamadas a la captura en seis funciones que marcan órdenes. Cubiertas por `tests/operational-hooks.test.cjs`, que ejecuta los fragmentos reales con datos ficticios y verifica que el estado se guarda antes y que la gestión continúa si la captura falla o no existe.
- **Almacenamiento:** las claves `cnfl_operation_capture_v1` y `cnfl_operation_events_v1` solo se escriben con el interruptor encendido. `backup.js` respalda todas las claves `cnfl_`, así que ambas entran en el respaldo; la prueba destructiva completa queda para la capa 6.

## Evidencia
- `node --test`: 236/236.
- Pruebas nuevas en `tests/operational-events.test.cjs`: apagado ⇒ sin captura ni escritura; sin script del interruptor ⇒ apagado; apagar detiene capturas siguientes; valor dañado ⇒ apagado.
- `tests/operational-capture-switch.test.cjs`: orden de scripts en las cinco páginas, precache de los tres scripts, ningún control de encendido todavía.
- Prueba en navegador (Chromium, 400×800, servidor local): las cinco páginas cargan sin errores de script; `CNFLCaptureSwitch.isEnabled()` = `false`; ninguna clave `cnfl_operation*` en `localStorage`; una captura forzada en `index.html` devuelve `false` y no escribe nada.

## Cómo revertir
Revertir el merge del PR. Si ya se publicó, revertir y subir `CACHE_NAME` a `cnfl-campo-v74`.

## Puertas de aceptación
- [x] `node --test` en verde.
- [x] Prueba en navegador con el interruptor apagado.
- [ ] CI de GitHub en verde.
- [ ] Revisión de Codex sin hallazgos pendientes.
- [ ] Aprobación del propietario para fusionar.
- [ ] Capa 3 (motor de traslado) solo con autorización nueva.
