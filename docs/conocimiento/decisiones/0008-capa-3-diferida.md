# 0008 · Capa 3 (motor de traslado) diferida; el cronómetro va directo

- **Fecha:** 2026-11-24
- **Fuente:** decisión del propietario ("lo que comprenda mi idea y sea aceptable"), tras la propuesta de saltar la capa 3.

## Contexto
El motor de traslado de M10-005 (PR #51) necesita dos marcas manuales por tramo ("iniciar traslado" y "llegué"). La decisión 0003 descartó el botón "Llegué": el tiempo de cada orden se cuenta desde la finalización anterior hasta la siguiente.

## Decisión
- La capa 3 **no se integra ahora**. PR #51 queda como referencia para un "Llegué" opcional futuro.
- La capa 4 (cronómetro visible) se construye directamente sobre las capas 0–2.
- El cronómetro guarda su propio estado (inicio y pausas) en `cnfl_operation_timer_v1`, separado de la bitácora de eventos; el motor de estadísticas de la capa 1 no cambia.
- Arranque: al abrir el mapa con la medición encendida y una jornada activa. Alternativa lógica (como en apps de servicio en campo): botón "Iniciar" en la tarjeta si el técnico no pasa por el mapa.

## Consecuencias
- Tiempo por orden = traslado + atención juntos, siempre etiquetado así.
- Si se quiere separar traslado y atención, hace falta una decisión nueva que reemplace la 0003.
