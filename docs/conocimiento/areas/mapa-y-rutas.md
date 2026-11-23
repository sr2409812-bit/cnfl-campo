# Área: Mapa y rutas

**Estado:** en trabajo.

## Qué hace
`mapa.html`: reúne pendientes con GPS de cortes, demanda, residencial y notificaciones; agrupa puntos cercanos; vista previa de ruta; ruta sugerida (VRS-OS) calculada solo al tocar un botón, con km, tiempo estimado y tramos largos (≥1,5 km) marcados. Desde la decisión 0003, abrir el mapa será el inicio del cronómetro (capa 4, aún no implementada).

## Archivos
`mapa.html`, `mapa.js`, `mapa-data.js`, `map-clusters.js`, `route-preview.js`, `route-optimizer.js`, `mapa.css`, `VRS-OS.md`.

## Datos
`cnfl_route_review_v1`, `cnfl_last_route_meta`, `cnfl_route_config`. La evaluación de una ruta no altera la ruta de ningún módulo.

## Pruebas
`map-clusters`, `map-selection`, `map-scope`, `mapa-data`, `route-preview`, `hotfix-map-route-limit`.

## Reglas
- La ruta sugerida no garantiza el óptimo global (`VRS-OS.md`).
- No mostrar una ruta parcial como válida; si OSRM rechaza el filtro vial, ofrecer un borrador señalado.
- El servidor público de OSRM rechaza `exclude=motorway`, usa perfil de auto (no de moto) y recibe las coordenadas. Para uso institucional hace falta un servicio autorizado por CNFL (`VRS-OS.md`).
- Tope de 120 paradas por módulo (HOTFIX-MAPA-001, PR #53).
- `setCutStatus` (`mapa-data.js:82`) es punto de captura previsto de M10.

## Pendientes
- Decisión · media: servicio de rutas que reemplace al OSRM público (perfil moto, exclusión de autopistas, sin enviar coordenadas a terceros).
