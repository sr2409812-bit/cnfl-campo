# 0003 · Cronómetro: inicia al abrir el mapa, cierra al finalizar la orden, con pausa

- **Fecha:** 2026-11-23
- **Fuente:** decisión del propietario en sesión de ingeniería.

## Contexto
El propietario quiere medir cuánto dura cada orden y hacer estudios estadísticos de su jornada. Se evaluó un botón "Llegué" para separar traslado de atención.

## Decisión
- El conteo **inicia al abrir el mapa** de la jornada.
- Cada orden **termina al darla por finalizada**.
- Hay **botón de pausa**; el tiempo pausado no cuenta.
- **No** hay botón "Llegué".
- Debe producir estudios estadísticos con lo recolectado.

## Consecuencias
- Tiempo por orden = desde la finalización anterior (o la apertura del mapa) hasta esta finalización, menos pausas. **Incluye traslado y atención juntos**; no se pueden separar sin otra marca.
- Si más adelante se quiere separar, se agrega un "Llegué" opcional como capa aparte, con decisión nueva.
- Sin GPS (ver 0001). Sin datos de cliente en los eventos.
