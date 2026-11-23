# Pendientes y deuda técnica

Estado en `main` @ `4dcdaae` (2026-11-23). Los issues con etiqueta `auditoria` son el registro vivo; esta lista es la foto consolidada.

## Alta
- **Base:** `data-store.js` se carga con `?v=` distintos según la página (`notificaciones.html`, `lectura.html`, `backup.html`, `index.html`). Un teléfono puede mezclar código viejo y nuevo.
- **Base:** `sw.js` precarga archivos que ninguna página usa: `lectura-pdf.js`, `-v2`, `-v3`, `-hotfix`, `lectura-residential-flow.js`, `hoy.*`.
- **Datos:** prueba destructiva de persistencia en teléfono real.
- **M10:** capas 0 y 1 en main (PR #58). Capa 2 (captura detrás del interruptor) en PR. Siguiente: capa 3.

## Media
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
