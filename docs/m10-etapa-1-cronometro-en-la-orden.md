# M10 · Etapa 1 del rediseño — Cronómetro junto a la orden actual

**Aprobado por el propietario (2026-11-24):** rediseño por etapas conservando la estética actual (azul noche, azul CNFL, naranja de acento, Arial). Lienzo de referencia: "CNFL Campo · Rediseño de campo" (privado).

## Diagnóstico
En el teléfono del propietario la tarjeta del mapa decía «Apagado»: con «Medir tiempos» apagado no se anota nada, por eso no había estadísticas. Causa de fondo: el interruptor solo existía en el mapa y la tarjeta de los módulos solo aparecía con la medición ya encendida, así que trabajando en Demanda no había forma de ver ni encender la medición.

## Cambio
- En Cortes, Demanda, Residencial y Notificaciones la tarjeta aparece cuando la jornada activa es de ese módulo, **encendida o apagada**, con el mismo interruptor (confirmación al encender y al apagar).
- En Demanda y Residencial va **justo antes de la orden actual** (`#currentReadingCard`).
- La tarjeta compacta también muestra mediana, P90 y última orden.
- Contraste: textos secundarios de `#687386` a `#5A6678`; botones e interruptor de 48 px.
- Sin cambios en el formato de datos ni en las claves. `CACHE_NAME` → `cnfl-campo-v75`.

## Riesgos
- **Service worker:** v75. Abrir la app con señal, cerrarla y abrirla una vez.
- **Almacenamiento:** ninguna clave nueva. Encender desde un módulo arranca el cronómetro en ese momento (antes solo desde el mapa).

## Evidencia
- `node --test`: 260/260 (2 pruebas nuevas en `tests/operational-timer.test.cjs`).
- Navegador (Chromium 390×844, jornada ficticia de Demanda): apagado → tarjeta antes de la orden actual, sin claves de medición; encender pide confirmación; 3 finalizaciones → «3 órdenes · promedio · Mediana · P90 · última»; Notificaciones (otro módulo) no la muestra; sin errores de script.

## Cómo revertir
Revertir el merge y subir `CACHE_NAME` a `cnfl-campo-v76`.
