# 0004 · M10 se integra por capas, detrás de un interruptor apagado

- **Fecha:** 2026-11-23
- **Fuente:** decisión del propietario ("integrar por capas y de forma organizada") y aprobación de arrancar las capas 0 y 1.

## Decisión
Cada capa es un PR propio hacia `main`, en orden, con su documento, pruebas sintéticas y CI en verde. Nada cambia en el teléfono hasta encender el interruptor en la última capa.

| Capa | Contenido | Origen |
|---|---|---|
| 0 | Interruptor "Medir tiempos", apagado por defecto | nuevo |
| 1 | Motor de estadísticas de finalizaciones | M10-002 (PR #48) |
| 2 | Captura en los 4 módulos y el mapa, detrás del interruptor | M10-003 (PR #49) |
| 3 | Motor de traslado — **diferida** (decisión 0008) | M10-005 (PR #51) |
| 4 | Cronómetro: inicio en el mapa, pausa, cierre por finalización | nuevo (decisión 0003) |
| 5 | Panel "Mis tiempos" con datos del propio teléfono | evoluciona M10-004 (PR #50) |
| 6 | Precache en `sw.js`, respaldo/restauración, prueba destructiva y en Android | nuevo |
| 7 | Encender el interruptor para uso propio | decisión |

## Puntos de captura previstos (de M10-003)
`app.js:672` `setOrderStatus`, `mapa-data.js:82` `setCutStatus`, `lectura.js:313` `markCurrentReading`, `lectura-ux.js:100` `markCurrentVisit` y `:239` `editSavedReading`, `notificaciones.html:56-57` `markDone` y `undoLastVisit` (líneas verificadas en `4dcdaae`). Cualquier cambio en estas funciones debe revisar la captura.
