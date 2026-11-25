# Etapa 2a del rediseño — Jornada guiada

**Aprobado por el propietario (2026-11-25):** rehacer la etapa 2 para cambiar el comportamiento de la app, en este orden: (1) jornada y cierre, (2) Waze y Maps sin señal, (3) menos botones. Cada parte va en su propio PR.

## Observaciones del propietario (uso real, 2026-11-25)
- La jornada del día anterior sigue apareciendo pendiente aunque ya terminó el trabajo.
- Con una jornada abierta se puede iniciar otra; la app no lo lleva a su trabajo.
- Puede pasar a otros módulos durante la jornada.
- «No aparece la ruta de ayer.»

## Diagnóstico (reproducido con dos días ficticios en Chromium)
- `journey.finish()` solo cerraba si la jornada estaba en el paso `report`, y para llegar había que ir a Resumen, marcar una casilla y finalizar. Si no se hacía, la jornada quedaba abierta y al día siguiente aparecía «Continuar jornada anterior».
- `journey.begin()` archivaba en silencio la jornada abierta al iniciar otra, aunque no estuviera cerrada.
- «Jornadas guardadas» mostraba solo las cerradas, así que la jornada archivada sin cerrar desaparecía del inicio. Sus órdenes **sí** seguían en Cargar › Rutas recientes: los datos no se perdían, pero no se veían.
- Nada impedía abrir otro módulo, el Mapa general o el menú de otros trabajos durante la jornada.

## Cambio
- `journey.js`
  - `begin()` no abre otra jornada si hay una abierta: devuelve `null`.
  - Nuevo `close()`: cierra desde cualquier paso, con resumen, nombre de la ruta y motivo (`user` o `next-day`).
  - Nuevo `progress()`: lee el avance del módulo sin modificarlo.
  - Nuevo `saved()`: devuelve las jornadas cerradas y también las archivadas sin cerrar.
- `campo.html` (Mi jornada)
  - Con una jornada de hoy abierta, abrir la app lleva directo a ella (al trabajo si ya hay avance; al mapa si todavía no).
  - Sin jornada abierta, muestra la elección de trabajo.
  - Con la jornada de otro día abierta, la acción principal es «Cerrar y guardar»; «Seguir con esa jornada» queda como secundaria.
  - «Jornadas guardadas» muestra la ruta, el avance y «sin cerrar» cuando corresponde.
- `campo-shell.js`
  - Modo jornada: entrar a otro módulo, o al Mapa general, redirige al módulo de la jornada (o a Mi jornada si la jornada es de otro día). El menú solo muestra Mi jornada, el trabajo en curso y Respaldo.
  - «Cerrar jornada» es un solo botón con confirmación, sin la casilla previa.
  - Cuando ya no quedan pendientes aparece «Terminaste las N órdenes» con el botón de cierre.
- Versiones `?v=` unificadas en todas las páginas para `campo-shell.css`, `lectura.css`, `data-store.js`, `journey.js`, `journey.css` y `campo-shell.js` (issue #62). `CACHE_NAME` → `cnfl-campo-v76`.

## Revisión de Codex (3 hallazgos P2, corregidos)
1. Desde Mi jornada, Notificaciones contaba solo las paradas hechas, así que una jornada a medias figuraba completa. `progress()` ahora usa el orden guardado (`state.order`) como inventario completo.
2. En Cortes, finalizar la última orden no mostraba «Terminaste las N órdenes» hasta recargar, porque `setOrderStatus()` no avisaba el avance. Ahora emite `cnfl-progress` (`app.js`).
3. Una pestaña vieja de Mi jornada podía cerrar otra jornada distinta a la que mostraba. Ahora verifica que la jornada activa sea la misma; si cambió, avisa y actualiza la pantalla. Verificado en el navegador con dos pestañas.

## Riesgos
- **Almacenamiento (`cnfl_journeys_v1`):** se agregan los campos `closedFromStep`, `closeReason` y `summary.routeName`. Las jornadas existentes se leen igual y no se borra nada. Las órdenes de cada módulo no se tocan. Todo entra en el respaldo (todas las claves `cnfl_`).
- **Service worker:** v76. Abrir la app con señal, cerrarla y abrirla una vez.
- **Cambio de comportamiento:** con una jornada abierta ya no se puede usar otro módulo sin cerrarla. Es lo pedido.

## Evidencia
- `node --test`: 266/266. Pruebas nuevas en `tests/journey.test.cjs`: bloqueo de una segunda jornada, cierre desde cualquier paso, avance, jornadas archivadas visibles, redirección. `tests/guide-removal-integration.test.cjs`: cierre en un paso por módulo y cierre cancelado.
- Navegador, Chromium 390×844, dos días ficticios:
  - Día 1: abrir la app lleva a Demanda; Cortes y el Mapa general redirigen a Demanda; el menú muestra solo Mi jornada, Lectura de demanda y Respaldo.
  - Día 2: Demanda y Cortes llevan a Mi jornada, que ofrece «Cerrar y guardar» (Ruta ficticia A · 2 de 4). Tras cerrarla queda en «Jornadas guardadas».
  - Nueva jornada: al terminar las 2 órdenes aparece «Terminaste las 2 órdenes»; al cerrar, vuelve a Mi jornada.
  - Rutas recientes conserva las dos rutas. Sin errores de script.

## Cómo revertir
Revertir el merge y subir `CACHE_NAME` a `cnfl-campo-v77`. Los campos nuevos de las jornadas se ignoran sin efecto.
