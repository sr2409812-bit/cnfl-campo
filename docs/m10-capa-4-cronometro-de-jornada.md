# M10 · Capa 4 — Cronómetro de jornada visible

**Autorización del propietario (2026-11-24):** botón visible para encender la medición (decisión 0007), saltar la capa 3 (decisión 0008) e implementar el cronómetro siguiendo un flujo lógico y modelos similares. **No autorizado:** GPS, envío de datos, uso para evaluar desempeño.

## Qué ve el técnico
**Mapa general:** tarjeta "Cronómetro de jornada".
- Interruptor **Medir tiempos** (apagado por defecto; pide confirmación al encender y al apagar).
- Encendido y con jornada activa: el cronómetro arranca al abrir el mapa.
- **Orden actual** (tiempo desde la última orden finalizada, o desde el inicio), **jornada** (tiempo efectivo), cantidad de órdenes, promedio, mediana, P90, última orden y órdenes por hora (solo con 2+ órdenes y 15+ minutos).
- Botón **Pausar / Reanudar**; insignia "EN PAUSA".
- Aviso: cada orden incluye traslado y atención; las pausas no cuentan.

**Cortes, Demanda, Residencial, Notificaciones:** tarjeta compacta al inicio del contenido, **solo** si la medición está encendida y la jornada activa es de ese módulo. Muestra orden actual, jornada, órdenes, promedio y Pausar/Reanudar. Si el cronómetro no arrancó, ofrece "Iniciar ahora".

Modelos de referencia: cronómetro de visita de apps de servicio en campo (Jobber, ServiceTitan) y cronómetros con pausa (Toggl): arranque explícito, pausa visible, tiempo calculado desde marcas.

## Cómo funciona
- `operational-timer.js` (puro, sin pantalla): estado por jornada en `cnfl_operation_timer_v1` → `{version:1, timers:{<journeyId>:{module, startedAt, startSource, pauses:[[inicio, fin|null]]}}}`, máximo 30 jornadas y 200 pausas.
  - `start()` es idempotente; `setPaused()` abre y cierra pausas.
  - Las finalizaciones salen de la bitácora de la capa 2 (`cnfl_operation_events_v1`), descontando reaperturas y deshacer.
  - `summarize()` calcula todo desde marcas guardadas y el instante actual: sobrevive recargas y cierres.
  - Solo escribe con el interruptor encendido y jornada activa. Datos dañados ⇒ sin cronómetro. Reloj alterado ⇒ "No medido".
- `operational-timer-ui.js`: tarjeta dentro del contenido (sin `position: fixed`, respeta PR #46), solo `textContent`/`createElement`, botones de 44 px, sin GPS ni red. El segundero solo redibuja; la fuente es la marca guardada.
- Ambos scripts se cargan después de la captura y antes de `campo-shell.js`, y se precargan en `sw.js` (`CACHE_NAME` → `cnfl-campo-v74`).

## Riesgos
- **Service worker:** caché v74. Abrir la app con señal y cerrarla y abrirla una vez.
- **Almacenamiento:** clave nueva `cnfl_operation_timer_v1`; solo se escribe con la medición encendida; entra en el respaldo (`backup.js` respalda todas las claves `cnfl_`).
- **Interpretación:** el tiempo por orden mezcla traslado y atención (decisión 0003).
- **Pendiente antes de la capa 5:** correcciones que cruzan las 06:00 en el motor de estadísticas (ver `docs/conocimiento/pendientes.md`). El cronómetro de esta capa no depende de ese cálculo: cuenta por jornada, no por día operativo.

## Evidencia
- `node --test`: 253/253. Pruebas nuevas en `tests/operational-timer.test.cjs`: apagado sin escrituras, sin jornada, inicio idempotente, pausas, pausa abierta, tiempos por orden con pausas, finalizaciones previas al inicio, reapertura/deshacer, reloj alterado, datos dañados, almacenamiento que falla, formato, tasa con muestra mínima, orden de scripts, precache, sin elementos flotantes ni HTML dinámico ni GPS/red. `tests/operational-capture-switch.test.cjs`: el único control de encendido es la tarjeta y confirma antes de cambiar.
- **Navegador real** (Chromium 390×844, servidor local, jornada ficticia de Demanda): mapa apagado sin claves de medición; encender pide confirmación y arranca el cronómetro; dos finalizaciones por la ruta real de captura suben el contador; pausa muestra "EN PAUSA"; Demanda muestra la tarjeta compacta; Notificaciones (otro módulo) no la muestra; apagar detiene la captura; sin errores de script.

## Cómo revertir
Revertir el merge y subir `CACHE_NAME` a `cnfl-campo-v75`. Lo medido queda en el teléfono sin efecto en las órdenes.

## Puertas de aceptación
- [x] `node --test` en verde.
- [x] Prueba en navegador con jornada ficticia.
- [ ] CI de GitHub y revisión de Codex.
- [ ] Aprobación del propietario para fusionar.
- [ ] Prueba en el teléfono del propietario (capa 6) antes de usarlo en una jornada larga.
