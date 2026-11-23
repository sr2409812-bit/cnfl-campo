# Área: Notificaciones

**Estado:** estable, sin pruebas propias.

## Qué hace
`notificaciones.html`: lista de notificaciones a entregar, su estado y sus paradas para el mapa general.

## Archivos
`notificaciones.html` (con lógica embebida), `notification-stops.js`, `field-route.js` (compartido con Lecturas).

## Datos
`cnfl_notificaciones_20261019_v2`; historial diario `cnfl_notification_daily_history_v1` (`journey.js`, `prepareNotifications`).

## Pruebas
Ninguna propia. Las paradas se ejercitan indirectamente en pruebas del mapa.

## Reglas
- `markDone` y `undoLastVisit` (`notificaciones.html:56-57`) son puntos de captura previstos de M10.
- Antes de cambiar su lógica, crear pruebas propias.

## Pendientes
- Baja: crear pruebas de notificaciones.
- Carga `data-store.js` con un `?v=` distinto al de otras páginas (ver `pendientes.md`).
