# Pendientes y deuda técnica

Estado en `main` @ `4dcdaae` (2026-11-23). Los issues con etiqueta `auditoria` son el registro vivo; esta lista es la foto consolidada.

## Alta
- **Base:** `data-store.js` se carga con `?v=` distintos según la página (`notificaciones.html`, `lectura.html`, `backup.html`, `index.html`). Un teléfono puede mezclar código viejo y nuevo.
- **Base:** `sw.js` precarga archivos que ninguna página usa: `lectura-pdf.js`, `-v2`, `-v3`, `-hotfix`, `lectura-residential-flow.js`, `hoy.*`.
- **Datos:** prueba destructiva de persistencia en teléfono real.
- **M10:** capas 0, 1 y 2 en main. Capa 3 diferida (decisión 0008). Capa 4 (cronómetro visible) en PR. Siguiente: capa 5 (panel de estadísticas) y capa 6 (prueba en teléfono).

## Media
- **M10 (antes de la capa 5):** el motor de estadísticas (`operational-stats.js`, `summarizeJourney`) filtra por día operativo antes de resolver correcciones. Si una jornada cruza las 06:00 y se reabre o deshace una orden del día anterior, el resumen de ese día la sigue contando y el del día siguiente reporta `orphan_correction`. Hallazgo de Codex en PR #59, verificado. Solo afecta con la medición encendida.
- **Lecturas:** caso de Contrato vacío en el generador de `validation/reading-pdf`.
- **Lecturas:** archivar los lectores PDF sin uso.
- **Base:** revisar `lectura-residencial.css` y `resolved_cache.json` (sin uso).
- **Mapa:** decidir el servicio de rutas que reemplace al OSRM público.

## Baja
- **Base:** ordenar el repo en carpetas, después de la limpieza.
- **Cortes:** partir `app.js`.
- **Lecturas:** partir `lectura.js`.
- **Notificaciones:** pruebas propias.
- **Ideas:** decidir qué hacer con `hoy.html`.
