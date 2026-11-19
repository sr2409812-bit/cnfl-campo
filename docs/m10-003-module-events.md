# M10-003 — Adaptadores de eventos y almacenamiento estadístico aislado

Estado: **solo rama de revisión**. Referencia: Issue #47 y PR #48 (M10-002). La autorización cubre desarrollo y pruebas sintéticas. **NO habilita fusión, despliegue, GPS ni operaciones sobre datos reales.**

## Árbol de dependencias

- La rama feat/m10-002-operational-stats-core contiene operational-stats.js y su contrato.
- La rama feat/m10-003-module-events-isolated deriva del HEAD exacto de M10-002; main sigue intacta.
- PR M10-003 debe apuntar a la rama M10-002 como base para mostrar solo el delta incremental, evitando introducir el código de ambas fases en una sola aprobación.
- El propietario deberá autorizar por separado cualquier merge o publicación.

## Motor y persistencia

El nuevo archivo operational-events.js recibe transiciones mediante captureTransition({module, identity, previousDone, done, source, at?, undo?}). No modifica objetos de órdenes, estado del módulo ni históricos existentes.

1. El handler guarda el estado real **antes** de invocar la captura opcional.
2. Se toma la hora del evento en el instante de la llamada, antes de las operaciones asíncronas.
3. Se verifica que existe jornada activa del módulo, un cambio efectivo de estado, fecha válida y fuente técnica.
4. Se construye orderKey opaco mediante SHA-256 aplicado a secreto aleatorio local + jornada + módulo + identidad de la orden. La identidad original permanece únicamente en memoria y no aparece en el ledger.
5. Se usa Web Locks para escrituras entre pestañas y una cola Promise local para ordenarlas. Sin Web Locks la telemetría se desactiva de forma segura.
6. Se escribe solo la nueva clave cnfl_operation_events_v1: version, secret, events. No se modifica ninguna clave anterior. Los eventos son append-only.
7. Duplicados de una orden ya completada no generan un segundo evento; deshacer y reabrir generan eventos compensatorios enlazados al evento de finalización previo.
8. Un ledger corrupto se conserva intacto, sin sobrescritura de reparación automática. Cada evento nuevo debe superar validación del motor M10-002.
9. Límite técnico: hasta 6.000 eventos y 1.000.000 caracteres JSON. Al superar límites, fallar almacenamiento o faltar Web Crypto/Web Locks, captura retorna false sin interrumpir ni revertir la gestión de campo.

## Matriz de integración por módulo

| Módulo | Punto de captura | Comportamiento |
| --- | --- | --- |
| Cortes | app.js, setOrderStatus | Pendiente a gestionada: finalización; regreso a pendiente: reapertura. Cambio entre estados gestionados: sin doble evento |
| Cortes desde mapa | mapa-data.js, setCutStatus | Misma regla; después de persistir tanto orden como historial existente |
| Demanda | lectura.js, markCurrentReading | Captura la gestión finalizada, sin alterar readAt |
| Residencial / UX | lectura-ux.js, markCurrentVisit y editSavedReading | Finalización y reapertura; aplazar y navegar no capturan |
| Notificaciones | notificaciones.html, markDone y undoLastVisit | Finalización y deshacer; avanzar/retroceder o renderizar no capturan |

La llamada al motor es opcional; la ausencia del script no debe impedir trabajar.

## Protección de datos y limitaciones

- Ledger contiene eventos seudónimos, sin lectura de medidor, NIS, contrato, cliente, coordenadas, dirección ni cantidad pagada. Sin GPS ni llamadas de red.
- El secreto de derivación viaja dentro del mismo respaldo: seudonimización **no equivale a anonimización** frente a alguien con acceso al respaldo completo. Requiere política institucional de acceso, retención y finalidad antes de utilizarlo en evaluaciones.
- La captura asíncrona podría perder eventos si se cierra inmediatamente una pestaña. No se garantizará cobertura completa hasta añadir indicadores/verificación en una fase autorizada.
- No capturar en navegadores sin Web Locks evita inconsistencias por escritura concurrente pero puede dejar estadísticas incompletas. Documentar esa cobertura.
- Reloj del teléfono incorrecto, cambio de hora y jornadas que cruzan las 06:00 Costa Rica requieren indicar anomalías; no se infieren promedios de traslados desde intervalos entre finalizaciones.
- attentionMs, travelMs, gpsDistanceMeters, roadDistanceMeters y averageTravelSpeedKmh continúan no medidos (null) en M10-003.
- No existe una interfaz nueva ni botón flotante, cronómetro visible, seguimiento GPS o envío de telemetría a terceros.

## Compatibilidad y respaldo

- HTML modificados en rama: index.html, lectura.html, lectura-residencial.html, notificaciones.html y mapa.html. Cargan primero journey.js, después operational-stats.js y operational-events.js, finalmente campo-shell.js.
- No se modifica campo.html, journey.js, data-store.js, backup.js, sw.js ni los cálculos de OSRM.
- backup.js v2 exporta automáticamente claves cnfl_ junto con IndexedDB; cnfl_operation_events_v1 entra por ese mecanismo. Restaurar el ledger sintético solo escribe su clave y conserva los demás grupos de campo. data-store.js ya refleja claves cnfl_ en IndexedDB (sin migración).
- El precache inicial del service worker aún no incluye los dos scripts. Primer arranque completamente offline deberá validarse y resolverse antes de usar telemetría como función crítica.

## Pruebas sintéticas

- tests/operational-events.test.cjs: contrato de escritura, seudónimos, idempotencia, reabrir/deshacer, módulos/jornadas, dos órdenes en la misma localización, fallos de cuota/crypto, datos corruptos, concurrencia y ausencia de Web Locks.
- tests/operational-hooks.test.cjs: ejecuta fragmentos de los handlers reales de Cortes, mapa, Lecturas, Residencial y Notificaciones con datos ficticios. Verifica escritura antes de captura y continuidad de gestiones cuando el adaptador no está presente.
- tests/operational-backup.test.cjs: inclusión en respaldo, restauración sin tocar órdenes y rollback ante error.
- Tests M10-002: intactos. GitHub Actions ejecuta node --test; pendiente de registrar resultado final de la rama.

## Criterios para una autorización futura de producción

1. Verificar aprobación de tests automáticos y revisión de diff.
2. Preparar un piloto sintético desde Android/Chrome, incluyendo offline, restauración y cierre abrupto.
3. Definir finalidad y retención institucional de telemetría y criterio de calidad mínima de datos.
4. Aprobar por separado el merge de PR #48, después el de PR M10-003, y los despliegues respectivos.
5. Ningún cambio a datos reales ni activación GPS autorizado por esta entrega.
