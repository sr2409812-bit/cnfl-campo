# Área: Datos y respaldo

**Estado:** atención.

## Qué hace
Capa de almacenamiento común (`data-store.js`) sobre IndexedDB `cnfl_campo_db` v1 (stores `kv` y `records`), y `backup.html` para respaldar y transferir datos entre teléfonos.

## Archivos
`data-store.js`, `backup.html`, `backup.js`.

## Pruebas
`backup-transfer`.

## Reglas
- Antecedente: pérdida de ~20 puntos en una versión previa (No verificado en código).
- No cambiar nombres de claves, stores ni `VERSION` de la base sin autorización expresa: puede dejar datos huérfanos.
- Probar solo con datos sintéticos y perfiles de navegador aislados.
- Toda versión nueva pasa la prueba destructiva antes de una jornada larga (ver `reglas.md`).
- Nuevas claves de M10 (`cnfl_operation_events_v1` y el interruptor) deben entrar en respaldo y restauración antes de encenderse (capa 6).

## Pendientes
- Alta: prueba destructiva de persistencia en teléfono real.
- `data-store.js` se carga con `?v=` distintos según la página (ver `pendientes.md`).
