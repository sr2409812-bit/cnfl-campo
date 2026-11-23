# Área: Cortes y reconexiones

**Estado:** estable.

## Qué hace
Pantalla `index.html`: carga órdenes de corte desde PDF con pdf.js, revisión del lote, orden manual de paradas, códigos de resultado, sellos, liquidación de cortes, compartir orden, botón a Telegram con la localización y optimizador de ruta local.

## Archivos
`index.html`, `app.js` (~2.100 líneas), `style.css`, `cuts-manual-order.js`, `cuts-liquidation.js`, `order-share.js`, `telegram-fix.js`, `route-optimizer.js`.

## Datos
`cnfl_work_orders` (clave principal de órdenes), `cnfl_order_history_v1`, `cnfl_manual_route_v1`, `cnfl_geocache`, `cnfl_pdf_batch_stale`; IndexedDB vía `data-store.js`.

## Pruebas
`cuts-liquidation`, `cuts-pdf-review`, `cuts-manual-order`, `cuts-memory`, `order-share`.

## Reglas
- Sello rojo = corte o servicio liquidado; 04 = corte exitoso; 0502 = notificado.
- `app.js` concentra mucho: cambios quirúrgicos y con prueba.
- `setOrderStatus` (`app.js:672`) es punto de captura previsto de M10 (decisión 0004).

## Pendientes
- Idea · baja: partir `app.js` por responsabilidades.
