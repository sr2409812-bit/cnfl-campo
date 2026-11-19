# M10-004 · Panel móvil experimental de estadísticas (datos 100 % sintéticos)

**Autorización del propietario:** preparar en rama independiente un panel móvil con escenarios ficticios, cobertura y calidad. **No autorizado:** acceso a jornadas reales, uso de almacenamiento real, GPS, fusión de ramas ni publicación en GitHub Pages.

## Rama y dependencia

- Rama M10-004: feat/m10-004-stats-mobile-demo.
- Punto de partida: M10-003, commit e3d9b6ce4c5690ff068a8b479a27e7f4d104324d.
- M10-002 (PR #48) → M10-003 (PR #49) → M10-004 (PR en borrador); no unir ni desplegar una fase sin autorización específica.
- No modificar los módulos existentes de trabajo ni incorporar un botón nuevo en producción.

## Entregable aislado

- estadisticas-demo.html: una página experimental independiente, no enlazada desde Cortes, Demanda, Residencial, Notificaciones, Mapa ni inicio.
- estadisticas-demo.css: presentación móvil, controles táctiles de al menos 45 px, accesibilidad con foco visible, sin barras ni elementos de posición fija.
- operational-stats-view.js: modelo puro de presentación que transforma un resultado de operational-stats.js en textos, indicadores de calidad e incidencias. No accede al teléfono.
- operational-stats-fixtures.js: datos estáticos inventados (fecha ficticia, orderKeys opacos ficticios, cero coordenadas).
- operational-stats-demo.js: selecciona cinco escenarios, calcula con motor M10-002 y actualiza el DOM de forma segura usando textContent y createElement. No usa innerHTML, red, persistencia ni geolocalización.
- tests/operational-stats-view.test.cjs y tests/operational-stats-demo.test.cjs: pruebas sintéticas de cálculo, interfaz, cinco escenarios, texto, aislamiento, privacidad y ausencia de overlays.

## Escenarios del laboratorio

1. Normal: cuatro finalizaciones sintéticas con intervalos 12, 15 y 18 minutos; media 15 min, mediana 15 min, P90 18 min.
2. Incompleto: mismos cuatro eventos y una entrada inválida; indica el evento rechazado y que el promedio es parcial.
3. Reloj alterado: un evento se registra cronológicamente después de otro, pero con hora de ocurrencia anterior. Se ocultan promedios, intervalo operativo y horarios como no confiables.
4. Reapertura: la segunda orden se revierte, quedan tres finalizadas; los intervalos efectivos son 27 y 18 min (media 22 min 30 s).
5. Sin datos: cero gestiones y cero intervalos; todos los tiempos como No medido, sin dividir por cero.

## Criterios de comunicación técnica

- El encabezado identifica de manera permanente «SOLO DATOS FICTICIOS».
- El indicador «Captura de todas las órdenes» **SIEMPRE** declara «No verificable» porque el contrato M10-003 carece de un contador de todas las operaciones reales y un mecanismo de acuse de captura.
- «Intervalos utilizables» usa exclusivamente los intervalos válidos del conjunto observado (ej.: 3 de 3). **No es un porcentaje de productividad ni una cobertura real de jornada.**
- Estado coherente describe solamente consistencia temporal de los registros disponibles, no captura completa ni exactitud del reloj.
- Estado incompleto muestra anomalías y excluye los eventos incorrectos; estado de reloj alterado retira todas las métricas temporales.
- La primera y última gestión son las marcas de órdenes finalizadas, **no** inicio/fin de turno laboral.
- Intervalo entre gestiones finalizadas NO equivale a traslado real: incluye atención, espera y pausas.
- Tiempo de traslado, atención, distancia por calles, distancia GPS y velocidad real permanecen **No medido**.
- Los identificadores originales, órdenes, NIS, medidores, localizaciones, datos personales y rutas nunca aparecen en las tarjetas. Las incidencias usan etiquetas fijas sin IDs.

## Protección y límites

- Los scripts de demostración no consultan el key cnfl_operation_events_v1, localStorage, IndexedDB, CNFLStore, API de mapa, permisos GPS ni servicios externos.
- No modificar sw.js ni añadir los archivos del laboratorio a la navegación de la app.
- No se publica una vista previa desde GitHub Pages en esta etapa; un enlace de revisión del código no equivale a un despliegue.
- Las pruebas automatizadas no prueban por sí solas el aspecto físico en Android/Chrome, un lector de pantalla o problemas de cierre de pestaña; requerirán validación posterior sin datos reales.
- Para evaluar desempeño individual hará falta política institucional, finalidad legítima, acceso, retención, revisión humana y datos suficientemente completos. No inferir productividad real desde una muestra parcial.

## Puerta de aceptación

- [ ] GitHub Actions: node --test completa sin errores.
- [ ] PR M10-004 en borrador con **base M10-003**, para aislar el diff.
- [ ] Verificar que main continúa intacta; M10-002 y M10-003 siguen sin fusionar.
- [ ] Sin cambios en HTML, JS, CSS, almacenamiento, GPS, API o service worker de los módulos de trabajo.
- [ ] No se han accedido datos reales, ni hay despliegue.
- [ ] Decisión posterior: el propietario debe autorizar expresamente cualquier integración o publicación.
