# 0006 · Base de conocimiento versionada: fuente o no se afirma

- **Fecha:** 2026-11-23
- **Fuente:** decisión del propietario ("una base de datos con conocimientos y correcciones, todo documentado, que todo tenga respaldo y Claude no tenga que imaginar datos").

## Decisión
- El conocimiento técnico vive en `docs/conocimiento/`, versionado en git y actualizado solo por PR.
- Cada dato lleva su fuente; lo que no la tiene se marca **No verificado** y no se usa para decidir.
- Como el repo es público, el conocimiento operativo sensible (zonas, edificios, rangos de cuentas, claves de acceso, cualquier dato de clientes) queda **fuera del repo**, en la base privada del propietario.

## Consecuencias
- Todo agente (Claude, Codex, auditorías) la lee antes de actuar.
- Cada incidente, decisión o corrección se registra aquí al cerrarse.
