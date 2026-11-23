# Área: Lecturas

**Estado:** en trabajo.

## Qué hace
Lectura de demanda (`lectura.html`) y residencial (`lectura-residencial.html`): importación de órdenes desde PDF (lector v4), captura de lecturas, mapa de la ruta y ruta de campo unificada. Ingreso manual como respaldo.

## Archivos
En uso: `lectura.html`, `lectura-residencial.html`, `lectura.js` (~1.500 líneas), `lectura-ux.js`, `lectura-pdf-v4.js`, `lectura-map.js`, `field-route.js`, `lectura.css`.
Sin uso: `lectura-pdf.js`, `lectura-pdf-v2.js`, `lectura-pdf-v3.js`, `lectura-pdf-hotfix.js`, `lectura-residential-flow.js`, `lectura-residencial.css`.

## Formatos y validación
Ver [../formatos-pdf/](../formatos-pdf/). Validación: `validation/reading-pdf/` (51 casos).

## Pruebas
`lmr0050-demand`, `reading-pdf-validation`, `residential-import`, `residential-reading-entry`, `field-route`, `field-route-integration`.

## Reglas
- `501` = medidor no accesible; no es una lectura.
- Contrato es opcional en LMR0050; MED + Medidor son obligatorios.
- Todo cambio en el lector se valida con `validation/reading-pdf`.
- Si el lector bloquea en jornada: "Ingresar lista manualmente".
- `markCurrentReading` (`lectura.js:313`), `markCurrentVisit` (`lectura-ux.js:100`) y `editSavedReading` (`lectura-ux.js:239`) son puntos de captura previstos de M10.

## Historial
- 2026-11-23: [incidente LMR0050 con Contrato vacío](../incidentes/2026-11-23-lmr0050-contrato-vacio.md), resuelto en PR #56.

## Pendientes
- Media: caso de Contrato vacío en el generador de `validation/reading-pdf`.
- Media: archivar los lectores PDF sin uso.
- Baja: partir `lectura.js` en módulos.
