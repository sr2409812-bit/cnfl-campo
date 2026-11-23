# Reglas de ingeniería y flujo de un cambio

Fuente principal: [`AGENTS.md`](../../AGENTS.md) (raíz del repo). Si este resumen y `AGENTS.md` difieren, manda `AGENTS.md`.

## Reglas permanentes
1. La app actual es la fuente de verdad. Inspeccionar antes de proponer.
2. No rediseñar ni reconstruir. No agregar, quitar ni cambiar funciones sin autorización expresa del propietario.
3. Cambios mínimos, delimitados y reversibles. Un cambio, un propósito.
4. Antes de tocar código: verificar rama, HEAD, estado del árbol y dependencias.
5. Datos de campo: nunca acceder, copiar, alterar ni borrar datos reales sin autorización específica. Pruebas solo con datos sintéticos.
6. No cambiar almacenamiento, esquemas, autenticación ni permisos sin autorización.
7. Nada a `main` ni a GitHub Pages sin aprobación. Abrir un PR no autoriza fusionarlo.
8. Sin secretos ni datos sensibles en GitHub.
9. Nada se declara terminado sin evidencia: comando, resultado y postcondición observable.
10. Distinguir siempre: hecho verificado, inferencia, propuesta y decisión aprobada.

## Flujo de un cambio
1. **Registro**: issue con área, tipo y prioridad.
2. **Diagnóstico**: leer el código del área, reproducir con datos sintéticos.
3. **Propuesta**: alcance, archivos, cambios que arrastra, riesgos, cómo se verifica, cómo se revierte. El propietario aprueba.
4. **Rama**: `tipo/area-descripcion` (ej. `fix/lecturas-lmr0050-contrato-vacio`). Hitos por fases: `feat/m10-00N-tema`. Auditorías: `audit/AAAA-MM-DD-tema`.
5. **Commits** convencionales en español: `feat(alcance): …`, `fix(…)`, `test(…)`, `docs(…)`, `style(…)`, `testdata(…)`.
6. **Verificación**: `node --test` completo. Si toca el lector PDF, `validation/reading-pdf` (51 casos). Si toca archivos precargados, subir `CACHE_NAME` en `sw.js`.
7. **PR en borrador** con: problema, causa, cambio, evidencia, riesgos, cómo revertir.
8. **Revisión**: CI de GitHub (`.github/workflows/verify.yml`) y revisión automática de Codex al marcar el PR como listo.
9. **Merge**: solo el propietario. Después, prueba en el teléfono antes de usar en jornada.
10. **Cierre**: actualizar la ficha del área y, si aplica, registrar incidente, decisión o aprendizaje en esta base.

## Cambios que arrastran otros cambios
| Si el cambio… | Entonces también |
|---|---|
| Toca un archivo de `CORE_ASSETS` en `sw.js` | Subir `CACHE_NAME`; actualizar `?v=` en **todas** las páginas que lo cargan. El SW usa `ignoreSearch:true` (`sw.js:97`, `sw.js:104`), así que `?v=` solo no basta. |
| Agrega un script | Cargarlo en la página antes de `campo-shell.js`, agregarlo a `CORE_ASSETS` y crear su prueba. |
| Toca claves `cnfl_` o IndexedDB | Avisar el riesgo antes de proponer; verificar respaldo/restauración en `backup.js`; prueba destructiva antes de jornada. |
| Toca el lector PDF | `validation/reading-pdf` antes y después. |
| Cambia estados de orden | Revisar los puntos de captura de M10 (ver `decisiones/0004`). |

## Prueba destructiva (antes de una jornada larga con versión nueva)
Crear ruta, marcar 2-3 paradas, salir, recargar, cerrar, reabrir, recuperar, continuar, editar, salir otra vez, recargar y verificar que todo volvió exacto. Fuente: decisión del propietario tras una pérdida de datos en una versión previa (ver `incidentes/README.md`; No verificado en código).
