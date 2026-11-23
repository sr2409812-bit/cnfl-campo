# 0002 · M10 no se habilita en producción sin nueva autorización

- **Fecha:** 2026-11-20
- **Fuente:** auditoría de compatibilidad M10 × HOTFIX-MAPA-001 (rama `test/m10-compatibility-hotfix-mapa`, PR #54).

## Contexto
Las fases M10-002 a M10-005 (estadísticas operativas, captura de eventos, panel demo, motor de traslado) pasaron 285/285 pruebas combinadas con `main`, pero quedaron bloqueos: sin prueba en teléfono, sin interruptor de captura, scripts fuera del precache del service worker, panel solo con datos ficticios, traslado sin controles.

## Decisión
Código compatible en pruebas sintéticas, **no aprobado para producción**. No se habilita captura real ni GPS sin decisiones nuevas y documentadas.

## Consecuencias
- La integración se hace por capas detrás de un interruptor apagado (ver 0004).
- Los PR #48–#51 y #54 son la referencia del trabajo hecho; no se fusionan tal como están.
