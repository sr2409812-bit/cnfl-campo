# 0001 · GPS continuo no autorizado

- **Fecha:** 2026-11-18
- **Fuente:** documento de la fase M10-005 (rama `feat/m10-005-travel-and-road-estimates`, PR #51) y auditoría de compatibilidad (PR #54).

## Contexto
Las estadísticas de traslado podrían calcularse con GPS continuo, pero eso implica rastrear la ubicación del técnico en segundo plano.

## Decisión
No se activa seguimiento GPS continuo ni se agregan permisos de ubicación para estadísticas. Distancias, si se usan, salen de la ruta calculada por calles y se etiquetan como estimadas.

## Consecuencias
- Velocidad y distancia "reales" se muestran como **No medido**.
- Cualquier propuesta con GPS continuo necesita una decisión nueva que reemplace esta.
