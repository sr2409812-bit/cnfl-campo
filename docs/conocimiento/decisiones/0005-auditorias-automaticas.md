# 0005 · Auditorías automáticas: documentan y proponen, nunca fusionan

- **Fecha:** 2026-11-23
- **Fuente:** decisión del propietario.

## Decisión
El sistema de ingeniería no depende de que el propietario abra Claude. Dos tareas programadas en la nube:
- **Chequeo diario**, 4:32 a.m. (hora de Costa Rica).
- **Auditoría semanal**, domingos 7:58 p.m.

Recopilan fallos y los documentan en issues con etiqueta `auditoria` y su área. Toda modificación se prepara en una copia (rama `audit/…`) como **PR en borrador** con etiqueta `requiere-aprobacion`. **Nunca** fusionan, publican, empujan a `main` ni tocan datos reales. Avisan al teléfono del propietario.

## Consecuencias
- Las auditorías leen esta base de conocimiento antes de actuar y proponen actualizarla por PR.
- Las tres capas de verificación: CI de GitHub (cada PR), Codex (revisión de PR) y estas auditorías.
