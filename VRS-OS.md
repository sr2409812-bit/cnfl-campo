# VRS-OS: ruta sugerida para campo

## Implementado en el mapa general

1. Reúne pendientes con GPS de cortes, demanda, residencial y notificaciones. Los trabajos en un mismo punto comparten parada; no se modifican los datos de cada módulo.
2. El técnico inicia desde la ubicación actual o desde la base configurada. El cálculo se realiza solo al tocar un botón.
3. Consulta una matriz dirigida de tiempos viales en OSRM con `exclude=motorway`. Ordena por una heurística de vecino cercano con varios inicios y mejora 2-opt. Para más de 24 paradas divide en bloques geográficamente próximos, hasta 120 paradas en total. Esto **no garantiza el óptimo global**.
4. Solicita geometría real por calles, en bloques de hasta 12 puntos. Si OSRM rechaza la exclusión, faltan conexiones, una coordenada queda a más de 100 m de una calle o la respuesta es incompleta, no muestra una ruta parcial como válida.
5. Dibuja el recorrido, numera paradas, muestra kilómetros y tiempo de circulación estimados. Los trabajos sin GPS se indican como omitidos. El técnico puede guardar una evaluación y una observación en el teléfono; esto no altera la ruta de ningún módulo.

## Restricciones todavía no verificables por el servicio público

La opción `exclude=motorway` no equivale a la máscara de la especificación completa. No excluye necesariamente `trunk`, vías con `maxspeed >= 60 km/h`, ni cruces transversales sin regulación. La API pública tampoco proporciona una clasificación fiable del conflicto de cada giro o datos de tráfico actual. El perfil de conducción utilizado no es específico para motocicleta.

Para certificar esas restricciones hace falta un motor propio con el extracto OSM actualizado y perfil de moto, clasificación y velocidades por arco, modelo de maniobra `(arco entrante, intersección, arco saliente)` con control de señales y exclusiones duras, y una matriz/servicio de geometría que apliquen **las mismas restricciones**. Debe rechazar rutas inviables en vez de relajar silenciosamente restricciones. Las ventanas de tiempo también necesitan una hora de inicio y una ventana verificable por trabajo; la app actual no guarda esas ventanas.

El servicio externo recibe las coordenadas al pedir el cálculo. Para uso institucional sostenido, debe sustituirse el endpoint público por un servicio autorizado por CNFL antes de tratar el resultado como guía operativa.
