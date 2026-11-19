# M10-005 — Contrato aislado de traslado por eventos y estimación por calles

**Autorización expresa del propietario:** preparación en rama independiente de eventos de inicio/llegada de traslado, tiempos y asociación con distancia estimada por calles, con pruebas exclusivamente sintéticas. **Prohibido:** leer/modificar datos reales de órdenes o GPS, fusionar, publicar o activar seguimiento GPS continuo.

## Dependencias y arquitectura

- M10-002: motor de órdenes completadas, contrato operational-event/v1, sin incorporar eventos de traslado (evita romper los registros existentes).
- M10-003: captura de finalizaciones reales en una clave estadística independiente, pendiente de autorización de publicación. **No se conecta el motor de traslado a esa clave**.
- M10-004: panel móvil DEMO independiente, con datos inventados. **Sin modificarlo ni añadir indicadores de traslado reales**.
- M10-005: nuevo archivo puro operational-travel.js, sin DOM, GPS, OSRM en línea, localStorage, IndexedDB, red, temporizadores o acceso a jornada actual.
- Rama M10-005 nace del commit exacto 4ee36814f3504ae1cb1adf52bfd9a8a869017d5e de M10-004, sin modificar main.
- Propuesta futura: un adaptador autorizado podría crear los eventos mediante controles mínimos «Iniciar traslado» y «Llegué». **No existen esos botones operativos en esta etapa**.

## Contrato travel-event/v1 (diferente de operational-event/v1)

Un evento inmutable por acción. Campos obligatorios: schemaVersion=1, eventId, journeyId, module, operationalDay, travelId, eventType, at, recordedAt, source, fromStopKey, toStopKey, routeSnapshotId y segmentIndex.

- eventType: solo travel_started o travel_arrived; no pausa/GPS aquí.
- source: manual_ui (acción declarada por persona) o synthetic (datos ficticios).
- at y recordedAt: UTC ISO 8601 canónico con milisegundos y Z, recordedAt no anterior a at.
- operationalDay: 06:00–05:59:59 en Costa Rica, evaluado por evento. Un tramo que cruza las 06:00 puede pertenecer a **dos días de evento** pero a un mismo journeyId.
- travelId: ID del traslado; debe tener **exactamente un inicio y una llegada**. Identidad y par de paradas deben coincidir; las fuentes y la referencia de ruta también deben ser idénticas.
- fromStopKey y toStopKey: identificadores de parada seudónimos, formato stop_ seguido de 32 caracteres hexadecimales. No pueden ser iguales. Nunca incluir localización, cliente, coordenadas ni lectura.
- routeSnapshotId: identificador único e inmutable de la ruta calculada antes de salir, o null si no hubo ruta; segmentIndex: índice 0–119 en la ruta o null si no hay ruta. Deben aparecer juntos o ser nulos juntos.
- Se prohíben campos extra como NIS, lat/lon, dirección, nombre de abonado, lectura y telemetría cruda.

Los tiempos se calculan de las **marcas manuales declaradas**, no de un cronómetro de JavaScript en ejecución. Un intervalo válido no certifica movimiento ni detecta todas las esperas/pausas por sí solo.

## Contrato road-segment/v1

Campos: schemaVersion=1, journeyId, module, routeSnapshotId, segmentIndex, fromStopKey, toStopKey, distanceMeters, provider, profile, filter y calculatedAt.

- provider: osrm (cuando provenga de una respuesta real validada) o synthetic (exclusivamente pruebas).
- profile: driving; no se interpreta como cálculo específico para motocicleta.
- filter: exclude_motorway cuando el cálculo vial **realmente se ejecutó con esa restricción**; unfiltered_draft si OSRM rechazó filtro o se solicitó borrador. El borrador se informa, pero **no suma kilómetros ni velocidad** en las métricas principales.
- distanceMeters: metros por calles del tramo, número finito >=0; no se estima por distancia geodésica ni a partir de velocidad GPS.
- calculatedAt: fecha de la ruta; debe ser anterior o igual al inicio del traslado para asociarse.
- El motor no utiliza ni almacena geometría, ubicación o contactos.

## Adaptador puro fromRoutePreview

El proyecto ya tiene CNFLRoutePreview.traceOrdered que devuelve ordered, segments, legMeters, meters, seconds y unfiltered.

La función fromRoutePreview(trace, meta) **no llama OSRM**:
1. Exige que cada punto trazado en trace.ordered tenga una clave stopKey opaca y estable (el código actual de rutas todavía no la suministra; la asignación requeriría autorización posterior).
2. Comprueba que legMeters contenga exactamente ordered.length-1 elementos y que la suma de distancias coincida aproximadamente con meters. Rechaza respuestas parciales/incompletas.
3. Copia **solo** stopKey, índice, distancia, snapshot, versión, origen, perfil, filtro y fecha; ignora coordenadas y geometría incluso si están presentes en el objeto de entrada.
4. No asigna los segundos globales de OSRM a cada tramo, porque route-preview.js no ofrece duración por tramo en su resultado. No se inventan velocidades medias a partir del tiempo estimado de OSRM.

## Algoritmo de agregación summarizeTravel

Entrada explícita: eventos de traslado, segmentos viales y {journeyId,module}. No lee registros ajenos.

1. Valida campos/fechas, filtra por jornada y módulo y contabiliza rechazos y eventos fuera de alcance.
2. Elimina eventos con eventId contradictorio; las repeticiones idénticas se deduplican.
3. Reconstruye por travelId un inicio y una llegada. Falta de uno, par cambiado, referencia/índice distinto, fuente distinta, tiempo <=0 o llegada registrada antes del inicio: **no contar**.
4. Si dos tramos válidos se solapan, ambos se excluyen de totales y se informa la anomalía para no contar dos veces el mismo tiempo. Tramos contiguos se permiten.
5. Duración por tramo = arrived.at − started.at. Total, media, mediana y P90 se calculan **solo con tramos declarados completos y cronología coherente**.
6. Enlaza distancia por routeSnapshotId + segmentIndex + jornada + módulo + fromStopKey + toStopKey. Rechaza cambios de ruta, tramos sin par válido, datos corruptos, duplicaciones contradictorias y rutas posteriores a la salida.
7. Si el filtro es unfiltered_draft no incorpora esos metros al agregado ni produce velocidad equivalente.
8. roadDistanceMeters = suma de distancias de calle pareadas y no borrador. roadMatchedTravelMs = suma de los **mismos** tramos, no de todos los trasladados.
9. equivalentRoadSpeedKmh = roadDistanceMeters * 3600 / roadMatchedTravelMs (metros y milisegundos). Es **velocidad equivalente según distancia estimada**, nunca velocidad real GPS; se informa también la cantidad de tramos emparejados.
10. Ante regresión detectada del reloj, invalid_timing: oculta tiempos, distancia emparejada y velocidad, pero conserva incidencias y conteos para auditoría.
11. gpsDistanceMeters y gpsAverageSpeedKmh permanecen null siempre.
12. captureCoverage permanece unverifiable: no existe auditoría independiente de todos los traslados reales. Estado coherent_sample describe solamente consistencia de una muestra, no cobertura real.

## Pruebas y aceptación

- tests/operational-travel.test.cjs: contrato, sanitización, 0/1/2 tramos, medias, percentiles, distancia y velocidad equivalente, ruta faltante, sin filtro, reoptimización, cruces de 06:00 CR, duplicados, fechas, solapes, reloj alterado, aislamiento por jornada/módulo, sin mutaciones.
- tests/operational-travel-road.test.cjs: shape de traceOrdered, mapeo de legMeters, rechazo de ruta incompleta, no filtración de lat/lon, snapshot mal asociado, demostración de proveedor OSRM sin confundir GPS.
- GitHub Actions: node --test (pendiente de validación y registro de resultado).
- PR M10-005 en borrador con base M10-004 para inspeccionar solo el cambio incremental.
- main, páginas de módulos, mapa, route-preview.js, sw.js, backup.js, IndexedDB, localStorage y servicio de rutas no se modifican por M10-005.

## Riesgos/bloqueos antes de cualquier piloto

1. Los tiempos provienen de acciones del técnico: intervalos sin acción/pausas no son necesariamente tiempo de conducción.
2. El sitio web puede suspenderse en segundo plano; el cronometraje por timestamps soporta recarga, **pero la emisión de eventos requerirá controles y persistencia autorizados**.
3. Los identificadores stopKey no existen todavía en la salida de rutas: hay que diseñar su vinculación y garantías de no reidentificación antes de instrumentar.
4. La ubicación en crudo y las credenciales del servicio vial no deben viajar al motor estadístico. OSRM público no garantiza filtrado de autopistas ni perfil de moto.
5. Una ruta OSRM puede no representar el trayecto tomado; la velocidad equivalente NO sirve para fiscalización individual automática.
6. Uso institucional/evaluaciones: autorización sobre finalidad, consentimiento/avisos, retención, acceso, sesgos, cobertura y revisión humana antes de habilitar captura real.
7. Si la ruta se genera después del traslado o no coincide el snapshot, la distancia se omite. No imputar kilómetros ficticios.
8. GPS continuo no está autorizado; no se introduce ningún permiso de ubicación ni servicio externo.

**Siguiente decisión:** una aprobación futura podría autorizar la preparación de controles manuales de traslado en un piloto sintético, separado del GPS. No fusionar ni publicar M10-005 sin una autorización específica posterior.
