# Auditoría de compatibilidad M10 × HOTFIX-MAPA-001

**Objeto:** verificar en rama independiente la convivencia técnica del código de M10-002 a M10-005 con la versión actual de producción que ya contiene HOTFIX-MAPA-001. Auditoría y pruebas exclusivamente sintéticas, no piloto de campo.

## Autorización / límites

El propietario autorizó continuar con la revisión de integración y preparar una **rama aislada** de compatibilidad. No autorizó nuevas capturas de jornadas reales, cambios de datos en su teléfono, fusión de M10, publicación de esta rama ni GPS.

- Base exacta de producción al iniciar: \`7af9a38552eaa85a34d72aac20245fbfb38c4e45\`.
- Fuente M10: \`b7b4f49577731f0f506d6bdb80d883134887f450\` (PR #51, acumulando PR #48 → #49 → #50 → #51).
- Rama: \`test/m10-compatibility-hotfix-mapa\`.
- Método: copiar los **29 blobs modificados** entre el ancestro común anterior al hotfix (\`d266d59af2a066a134d8980f32681342441c3c02\`) y la rama acumulada M10 encima del árbol de \`main\` **sin reemplazar los tres archivos del hotfix**. Commit de snapshot reversible y sin operaciones sobre PR anteriores.
- No hubo conflictos de archivos: intersección de los 29 archivos de M10 con \`mapa.js\`, \`tests/hotfix-map-route-limit.test.cjs\` y \`tests/map-scope.test.cjs\` = **cero**.
- La versión publicada, sus rutas reales y los PR M10 no se modifican con esta prueba. **No utilizar este PR para fusionar**.

## Alcance incluido

- **M10-002:** \`operational-stats.js\`, pruebas y contrato de estadística.
- **M10-003:** \`operational-events.js\`, hooks ya preparados en cuatro módulos y mapa, scripts cargados en páginas correspondientes, pruebas de integridad/respaldo.
- **M10-004:** página \`estadisticas-demo.html\` y panel estadístico sintético (no se conecta a eventos reales), pruebas.
- **M10-005:** \`operational-travel.js\`, contrato puro de inicio/llegada y asociación con distancia por calles (no GPS, no UI real), pruebas.
- **Hotfix preservado:** \`mapa.js\` de \`main\`, límite de 120 por módulo y escritura segura con avisos, tests de regresión y actualización de tests de mapa.

## Pruebas conjuntas

- \`node --test\` de CI, incluyendo todos los tests preexistentes de la app, M10 y hotfix.
- \`tests/m10-compatibility-hotfix-map.test.cjs\`: comprueba continuidad del límite de ruta, **63 Demanda + 57 Cortes → 64 Demanda**, sin eventos estadísticos al ordenar; simula cambio de estado de Corte en mapa y verifica que la telemetría separada guarda solamente un seudónimo y no altera rutas; ausencia de datos reales; contexto de cuota local fallida; orden de scripts y distinción de velocidad estimada frente a GPS.
- Todas las órdenes, coordenadas y rutas de pruebas se crean en **memoria sintética**. No se leen jornadas del propietario.

## Hallazgos y bloqueos de despliegue

1. **No existe validación móvil integrada.** El PR de compatibilidad no equivale a una prueba real Android/Chrome ni garantiza condiciones de conectividad, batería o cierre del navegador.
2. **Captura real no autorizada.** M10-003 contiene hooks de órdenes que, si se publicaran, intentarían guardar eventos seudonimizados de trabajo real en \`cnfl_operation_events_v1\`. Aunque no modifica los datos primarios y el motor estadístico falla cerrado, requiere consentimiento/autorización del propietario y un mecanismo explícito de activación/pausa antes de producción.
3. **Offline incompleto.** El service worker de \`main\` (\`cnfl-campo-v71\`) todavía no incluye en \`CORE_ASSETS\` a \`operational-stats.js\` ni \`operational-events.js\`. En un primer acceso offline podrían faltar los scripts y perderse eventos; las pruebas verifican el riesgo, **no lo corrigen**.
4. **Eventos asíncronos.** M10-003 utiliza SHA-256 y Web Locks para escribir en una clave independiente; sin Web Locks registra cero eventos y un cierre rápido de pantalla puede perder el evento en vuelo. No existe indicador de cobertura global independiente.
5. **Panel sintético exclusivamente.** M10-004 no lee la bitácora de órdenes reales, por prohibición del propietario; no hay interfaz de estadísticas reales aprobada.
6. **Traslado no instrumentado.** M10-005 proporciona un motor puro: faltan controles manuales «Iniciar traslado»/«Llegué», asociación estable de \`stopKey\` a \`CNFLRoutePreview.traceOrdered\` y validación vial. No hay GPS continuo.
7. **Persistencia / reversibilidad.** No se prueba restauración de datos reales; los respaldos ya documentados en M10-003 solo se comprueban con material sintético.
8. **No hay conflictos de archivos con el hotfix**, pero la ausencia de conflictos no certifica compatibilidad temporal ni cobertura íntegra.

## Puertas antes de autorizar producción

- CI sintética conjunta **aprobada** (anotar resultado real al verificar GitHub Actions).
- Prueba de interfaz/retrocesos en dispositivo de pruebas sin datos de campo.
- Estrategia explícita para habilitar/deshabilitar captura y política de privacidad/retención.
- Tratamiento offline/precache; respuesta ante falla de Web Locks/crypto/cierre abrupto y calidad/cobertura visibles.
- Plan de respaldo y reversión validado antes de cualquier integración de datos reales.
- Nuevas autorizaciones independientes para cualquier fusión o despliegue; la rama de compatibilidad permanece **PR borrador/no fusionado**.

**Decisión provisional:** test de compatibilidad solamente. No habilitar todavía M10 en producción ni GPS.
