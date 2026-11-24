# Arquitectura

Estado verificado en `main` @ `4dcdaae` (2026-11-23).

## Principio
Aplicación web estática, multipágina, instalable (PWA), sin framework ni paso de build. Todo se procesa y guarda en el teléfono; no hay backend propio.

## Páginas
| Página | Área | Scripts propios que carga (en orden) |
|---|---|---|
| `campo.html` (inicio, `start_url` en `manifest.json`) | Base | `journey.js` |
| `index.html` | Cortes | `data-store`, `cuts-manual-order`, `order-share`, `cuts-liquidation`, `app`, `telegram-fix`, `route-optimizer`, `journey`, `campo-shell` |
| `lectura.html` | Lecturas (demanda) | `data-store`, `field-route`, `lectura`, `lectura-ux`, `lectura-pdf-v4`, `lectura-map`, `journey`, `campo-shell` |
| `lectura-residencial.html` | Lecturas (residencial) | igual que `lectura.html` |
| `notificaciones.html` | Notificaciones | `data-store`, `notification-stops`, `field-route`, `journey`, `campo-shell` (+ script embebido) |
| `mapa.html` | Mapa y rutas | `notification-stops`, `map-clusters`, `mapa-data`, `route-preview`, `journey`, `mapa`, `campo-shell` |
| `backup.html` | Datos y respaldo | `data-store`, `backup` |
| `ideas.html`, `hoy.html` | Ideas | `hoy.html` no está enlazada desde ninguna página |

Fuente: etiquetas `<script src>` de cada HTML.

## Librerías externas (CDN, versión fija)
- pdf.js 3.11.174 (cdnjs): lectura de PDF.
- Leaflet 1.9.4 (unpkg): mapas.
- Font Awesome 6.5.0 (cdnjs): íconos. También es el ícono de `manifest.json`, que por eso no está disponible sin conexión la primera vez.

## Servicios externos
- `router.project-osrm.org`: matriz y geometría de la ruta sugerida. Servicio público que recibe coordenadas. Ver `areas/mapa-y-rutas.md`.
- Teselas de OpenStreetMap.
- Enlaces de salida: Waze, Google Maps, Telegram, WhatsApp.
- No usa la API de Anthropic ni ningún backend propio.

## Almacenamiento en el teléfono
- **IndexedDB** `cnfl_campo_db`, versión 1 (`data-store.js:2-3`), stores `kv` y `records`.
- **localStorage**, prefijo `cnfl_`. Claves principales: `cnfl_work_orders`, `cnfl_geocache`, `cnfl_manual_route_v1`, `cnfl_route_review_v1`, `cnfl_last_route_meta`, `cnfl_route_config`, `cnfl_pdf_batch_stale`, `cnfl_order_history_v1`, `cnfl_notificaciones_20261019_v2`, `cnfl_last_module`, `cnfl_journeys_v1` (`journey.js:3`). Medición (M10, solo con el interruptor encendido): `cnfl_operation_capture_v1`, `cnfl_operation_events_v1`, `cnfl_operation_timer_v1`.
- El "día operativo" corta a las 06:00 hora de Costa Rica (`journey.js:5-9`).
- Cambiar nombres de claves, stores o la versión de la base requiere autorización expresa.

## Service worker
- `sw.js`, `CACHE_NAME` = `cnfl-campo-v74` desde la capa 4 de M10 (v73 en la capa 2, v72 en el PR #56).
- `CORE_ASSETS`: lista de precarga.
- Busca en caché con `ignoreSearch:true` (`sw.js:97`, `sw.js:104`): el `?v=` de las páginas **no** fuerza una descarga nueva; hay que subir `CACHE_NAME`.
- Precarga archivos que ninguna página usa (ver `pendientes.md`).

## Pruebas
- `node --test`: `tests/*.test.cjs`, sin dependencias npm. 160/160 en `4dcdaae`.
- `validation/reading-pdf/`: 51 PDFs sintéticos con pdf.js 3.11.174 real (ver su `README.md`).
- CI: `.github/workflows/verify.yml` (Node 22) en cada PR y push a `main`.
- Revisión automática de Codex al marcar un PR como listo.

## Publicación
GitHub Pages desde `main`: `https://sr2409812-bit.github.io/cnfl-campo/`. El repositorio es público.
