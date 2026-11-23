# Aprendizajes

Formato: fecha · tipo · aprendizaje · fuente. Tipos: patrón, preferencia, corrección, lección.

## Forma de trabajar del propietario
- 2026-11-21 · patrón · Hitos por fases numeradas (M10-002, M10-003…), una rama por fase, PR en borrador. · ramas `feat/m10-*`
- 2026-11-21 · patrón · Cada fase lleva `docs/m10-xxx-*.md`: autorización y límites, contrato, reglas verificables, riesgos, puertas de aceptación. · PR #48–#51
- 2026-11-21 · patrón · Orden de construcción: motor puro → adaptadores → demo con datos ficticios → integración. · M10
- 2026-11-21 · patrón · Antes de integrar, rama de compatibilidad con CI registrado. · PR #54
- 2026-11-21 · preferencia · Lo opcional nunca bloquea el trabajo de campo; falla cerrado. · M10-003
- 2026-11-21 · preferencia · Lo no medido se muestra como "No medido"; nada de tiempos, km o velocidades inventados. · M10-002/005
- 2026-11-23 · patrón · El propietario fusiona los PR desde el teléfono después de ver CI en verde. · PR #56
- 2026-11-23 · preferencia · El sistema de ingeniería no debe depender de que él entre a Claude. · decisión 0005

## Lecciones técnicas
- 2026-11-23 · lección · Los listados reales pueden traer columnas vacías sin marcador; distinguir vacío permitido de vacío bloqueante. · incidente LMR0050
- 2026-11-23 · lección · El service worker ignora `?v=`; todo cambio en archivos precargados exige `CACHE_NAME` nuevo. · `sw.js:97`
- 2026-11-23 · lección · Ante un bloqueo del lector en jornada, la salida es el ingreso manual `Localización Medidor`. · `lectura.html`
- 2026-11-23 · lección · Codex revisa cada PR automáticamente al marcarlo listo. · PR #56
- 2026-11-23 · lección · El repo es público: el conocimiento operativo sensible no se versiona aquí. · decisión 0006
