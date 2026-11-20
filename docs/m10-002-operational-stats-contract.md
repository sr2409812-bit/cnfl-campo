# M10-002 — Contrato de estadísticas operativas v1

**Alcance:** motor puro, sin conexión con UI ni con jornadas reales. Vinculado al Issue #47. No se autorizó integración, persistencia, GPS, publicación ni uso institucional de telemetría.

## API y aislamiento

- Archivo: operational-stats.js. Compatible con Node (require) y navegador (CNFLOperationalStats global), pero NO referenciado desde HTML.
- operationalDayFromIso(isoUTC): día operativo de Costa Rica, cortado a las 06:00.
- validateEvent(event): devuelve copia canónica validada o códigos de rechazo, sin mutar.
- summarizeJourney(events, {journeyId,module,operationalDay}): devuelve métricas por jornada/módulo/día explicitados. No realiza lecturas, escrituras, acceso a GPS, red ni temporizadores.
- tests/operational-stats.test.cjs contiene datos enteramente sintéticos.

## Contrato operational-event/v1

| Campo | Regla |
| --- | --- |
| schemaVersion | Número 1 |
| eventId | ID único local de 1–128 caracteres seguros; reintentos idénticos comparten ID |
| journeyId | Identificador de CNFLJourney, sin modificarlo |
| module | cortes, demanda, residencial o notificaciones |
| operationalDay | Fecha YYYY-MM-DD; debe coincidir con la fecha operativa calculada desde at (Costa Rica, corte 06:00) |
| orderKey | Para gestiones, prefijo ord_ seguido por 32 dígitos hexadecimales (seudónimo opaco). Para eventos de jornada, null |
| eventType | order_completed, order_reopened, order_undo, journey_opened, journey_closed |
| at | Momento de ocurrencia UTC ISO 8601, milisegundos, sufijo Z |
| recordedAt | Momento de persistencia UTC ISO 8601, no anterior a at |
| source | Etiqueta técnica de origen, sin datos del abonado: ui, mapa, etc. |
| quality | observed, estimated, incomplete o invalid; solo observed influye en los resultados de esta fase |
| sourceEventId | Obligatorio para order_reopened y order_undo: referencia a la finalización exacta |
| payload | Ausente o vacío. No se aceptan datos de cliente, NIS, medidor, dirección, lectura o ubicación |

Eventos de traslado y pausa (travel_started, travel_arrived, pause_started, pause_ended) están reservados para una fase futura y se rechazan por ahora.

### Ejemplo ficticio (no datos de campo)

    {
      schemaVersion: 1,
      eventId: 'e1',
      journeyId: '2026-11-18:demanda:1795000000000',
      module: 'demanda',
      operationalDay: '2026-11-18',
      orderKey: 'ord_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      eventType: 'order_completed',
      at: '2026-11-18T15:00:00.000Z',
      recordedAt: '2026-11-18T15:00:00.000Z',
      source: 'ui',
      quality: 'observed'
    }

El motor NO crea eventos y NO genera el seudónimo. La correspondencia entre orderKey y una orden real debe diseñarse y autorizarse en M10-003, sin guardar identificadores personales en los eventos.

## Reglas de cálculo verificables

1. Validación estricta: eventos inválidos quedan excluidos y documentados como invalid_event. Eventos de otro alcance se cuentan en outsideScopeEvents y no afectan métricas.
2. eventId idéntico se procesa una sola vez. Si dos eventos comparten eventId pero difieren, ambos se excluyen: conflicting_event_id.
3. Secuencia efectiva: order_completed registra una finalización por orderKey. order_reopened/undo solo anulan la finalización activa que coincide exactamente con sourceEventId. Una nueva finalización posterior puede volver a contar.
4. Finalizaciones repetidas sin corrección se ignoran y reportan duplicate_order_completion. Correcciones inexistentes o antiguas se reportan sin modificar gestiones válidas.
5. completedOrders = cantidad de órdenes efectivamente finalizadas después de correcciones. firstCompletedAt y lastCompletedAt son sus extremos.
6. observedWindowMs = última menos primera gestión, solo con N>=2. No representa la jornada laboral completa. En N=0/1 el valor es null.
7. intervalsMs = diferencias positivas de finalización entre órdenes consecutivas. Ceros se excluyen y reportan con cobertura reducida. meanIntervalMs = promedio de esos intervalos; mediana convencional y P90 por rango más cercano (ceil(0.9*N)).
8. completedOrdersPerHour = N / (observedWindowMs / 3600000), únicamente si la ventana es positiva. Esta tasa refleja el intervalo primera-última, no toda la jornada.
9. Si recordedAt demuestra retroceso cronológico de at se reporta clock_discontinuity y se anulan las métricas temporales, conservando el conteo y la incidencia.
10. attentionMs, travelMs, roadDistanceMeters, gpsDistanceMeters y averageTravelSpeedKmh son siempre null en M10-002. **No se inventan tiempos de traslado, kilómetros recorridos ni velocidad real.**
11. quality es observed si el conjunto es consistente, incomplete cuando hay incidencias de datos, e invalid_timing ante discontinuidad horaria.

## Riesgos pendientes y puertas de control

- No se implementa almacenamiento. Una bitácora independiente (nombre propuesto: cnfl_operation_events_v1) requiere aprobación nueva y pruebas de backup/restore, cuota e idempotencia.
- No se instrumentan handlers de Cortes, Demanda, Residencial, Notificaciones ni cambios desde el mapa. M10-003 deberá identificar todos los caminos de gestión, reabrir y deshacer sin doble registro.
- El contrato exige orderKey opaco. Su generación y resolución local sin exposición de datos reales están pendientes; no usar hashes simples de identificadores de abonado.
- Una jornada que cruza las 06:00 necesita política de atribución explícita. Marcas de tiempo y reloj del teléfono no garantizan exactitud absoluta.
- GPS, velocidad real y localización en segundo plano fuera de alcance; las estadísticas no deben utilizarse sin contexto humano para evaluaciones laborales.
- No hay datos reales, cambios de producción, HTML, IndexedDB, respaldo ni service worker en este PR.

## Aceptación de M10-002

- Pruebas sintéticas de N=0/1/N, promedios, percentiles, duplicados, reversiones, horas y calidad.
- CI de GitHub Actions ejecuta node --test correctamente.
- PR revisable vinculado a Issue #47; main sin cambios.
- M10-003, merge y publicación únicamente mediante nueva autorización expresa del propietario.
