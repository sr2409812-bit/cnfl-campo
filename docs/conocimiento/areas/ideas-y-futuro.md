# Área: Ideas y futuro

**Estado:** en trabajo (hito M10).

## Hito M10: estadísticas operativas y cronómetro de jornada
Objetivo: medir el tiempo de cada orden y la jornada, y producir estudios estadísticos propios del técnico. Decisiones: 0001, 0002, 0003, 0004.

### Trabajo previo (ramas sin fusionar, referencia)
| Fase | Rama / PR | Qué hace |
|---|---|---|
| M10-002 | `feat/m10-002-operational-stats-core` · #48 | Motor puro de eventos y métricas |
| M10-003 | `feat/m10-003-module-events-isolated` · #49 | Captura en módulos, clave aislada `cnfl_operation_events_v1`, seudónimos |
| M10-004 | `feat/m10-004-stats-mobile-demo` · #50 | Panel demo con datos ficticios |
| M10-005 | `feat/m10-005-travel-and-road-estimates` · #51 | Motor de traslado y distancia por calles |
| Compat. | `test/m10-compatibility-hotfix-mapa` · #54 | Todo M10 sobre main: 285/285 |

### Integración por capas
Ver la tabla de la decisión [0004](../decisiones/0004-m10-integracion-por-capas.md).

| Capa | Estado |
|---|---|
| 0 Interruptor | En main (PR #58) |
| 1 Motor de estadísticas | En main (PR #58) |
| 2 Captura detrás del interruptor | En main (PR #59) |
| 3 Motor de traslado | Diferida (decisión 0008) |
| 4 Cronómetro visible | En PR (ver `docs/m10-capa-4-cronometro-de-jornada.md`) |
| 5–7 | Pendientes |

### Estadísticas previstas
Por jornada (órdenes, tiempo efectivo, pausas, órdenes por hora), por orden (media, mediana, P90, mínimo, máximo, atípicas), por módulo, por hora del día, por día de la semana, tendencia semanal y calidad de datos.

### Límites
Sin GPS continuo. Sin datos de cliente en los eventos. Estadísticas de uso propio; no son evaluación de desempeño sin política institucional.

## Otras ideas
- `ideas.html` existe; `hoy.html` no está enlazada (decidir qué hacer).
- Hoja de ruta general: validar persistencia → piloto con compañeros → demo controlada a jefatura, sin presentarla como reemplazo del sistema oficial.
