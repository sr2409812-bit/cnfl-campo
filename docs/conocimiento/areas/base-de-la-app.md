# Área: Base de la app

**Estado:** en trabajo.

## Qué hace
Lo que comparten los módulos: navegación común (`campo-shell`), inicio de la PWA (`campo.html`), jornada (`journey`), service worker para uso sin señal, manifiesto, servidor local de desarrollo, CI y reglas del repo.

## Archivos
`campo-shell.js/.css`, `campo.html/.css`, `journey.js/.css`, `sw.js`, `manifest.json`, `server.js` (servidor local, puerto 8080), `robots.txt`, `AGENTS.md`, `.github/workflows/verify.yml`.

## Pruebas
`journey`, `guide-removal-integration`. CI corre `node --test` completo con Node 22.

## Reglas
- Cambios mínimos y reversibles (`AGENTS.md`).
- Cambiar un archivo precargado exige subir `CACHE_NAME` (hoy `cnfl-campo-v74`).
- `node --test` completo debe pasar antes de cada PR.

## Pendientes
- Alta: versiones `?v=` distintas del mismo archivo entre páginas.
- Alta: `sw.js` precarga archivos que ninguna página usa.
- Media: revisar `lectura-residencial.css` y `resolved_cache.json` (sin uso).
- Baja: ordenar el repo en carpetas, después de la limpieza.
