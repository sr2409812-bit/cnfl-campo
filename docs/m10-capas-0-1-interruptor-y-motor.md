# M10 · Capas 0 y 1 — Interruptor "Medir tiempos" y motor de estadísticas

**Autorización del propietario (2026-11-23):** arrancar las capas 0 y 1 de la integración por capas (decisión 0004 de la base de conocimiento). **No autorizado en esta entrega:** cargar los scripts en páginas, capturar eventos reales, cambiar el service worker, GPS, publicar.

## Alcance
| Capa | Archivo | Qué hace | Origen |
|---|---|---|---|
| 0 | `operational-capture-switch.js` | Interruptor apagado por defecto y `guard()` para que toda captura futura pase por él | nuevo |
| 1 | `operational-stats.js` | Motor puro de eventos y métricas de finalizaciones | M10-002 (PR #48), commits traídos sin cambios sobre `main` actual |

Ambos archivos son **inertes**: ninguna página ni `sw.js` los carga. Hay una prueba que lo verifica.

## Contrato de la capa 0
- Clave: `cnfl_operation_capture_v1` → `{version:1, enabled:boolean, changedAt:ISO|null}`.
- `read(storage)`: siempre devuelve un estado válido. Sin valor, valor dañado, otra versión o almacenamiento que falla ⇒ `enabled:false` (falla cerrado). Nunca lanza.
- `isEnabled(storage)`: atajo booleano.
- `setEnabled(storage, boolean, now)`: acción explícita de la persona. Escribe solo su clave y verifica que quedó guardada. Devuelve `{ok, enabled, changedAt}` o `{ok:false, error}`.
- `guard(storage, capture)`: ejecuta `capture` solo si el interruptor está encendido. Atrapa errores síncronos y asíncronos y devuelve `false`: una falla de medición nunca interrumpe una gestión de campo.

## Capa 1
Contrato, fórmulas y límites: `docs/m10-002-operational-stats-contract.md` (sin cambios).

## Riesgos
- **Almacenamiento:** se define una clave nueva `cnfl_operation_capture_v1`. En esta capa **nadie la escribe** porque ningún script se carga. Antes de encender (capa 6) debe entrar en respaldo y restauración.
- **Service worker:** sin cambios. Cuando las páginas carguen estos scripts (capas 2 y 4), habrá que agregarlos a `CORE_ASSETS` y subir `CACHE_NAME`.
- PR #48 queda como referencia: su contenido entra aquí sin modificaciones.

## Pruebas
- `tests/operational-stats.test.cjs` (M10-002, sin cambios).
- `tests/operational-capture-switch.test.cjs`: apagado por defecto, encendido/apagado sin tocar otras claves, valores dañados ⇒ apagado, almacenamiento que falla sin errores, `guard` no ejecuta apagado, `guard` no propaga errores, y ninguna página ni el SW cargan los scripts.

## Puertas de aceptación
- [x] `node --test` completo en verde.
- [ ] CI de GitHub en verde.
- [ ] Revisión de Codex sin hallazgos pendientes.
- [ ] Aprobación del propietario para fusionar.
- [ ] Siguiente capa (2: captura detrás del interruptor) solo con autorización nueva.
