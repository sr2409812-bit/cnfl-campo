# 0007 · Botón visible "Medir tiempos" en la app

- **Fecha:** 2026-11-24
- **Fuente:** decisión del propietario en sesión de ingeniería ("siguiendo un flujo de trabajo lógico y basándonos en modelos similares implementa lo que sea apto"), en respuesta a la pregunta de autorizar un botón visible que reemplace la restricción de solo laboratorio.
- **Reemplaza:** la restricción del issue #55 (M10-008) de habilitar la captura solo en memoria, sin botón y únicamente en un laboratorio sintético.

## Contexto
M10-008 se definió para una fase de laboratorio. La decisión 0003 (cronómetro que arranca al abrir el mapa) implica usar la medición en campo, así que hace falta un control visible.

## Decisión
- La medición se enciende y se apaga con un interruptor **"Medir tiempos"** en la tarjeta "Cronómetro de jornada" del mapa.
- **Apagada por defecto.** Encender y apagar piden confirmación con texto claro de qué se guarda.
- El estado del interruptor se guarda en el teléfono (`cnfl_operation_capture_v1`), para que la medición siga encendida entre recargas mientras dure la jornada. Esto difiere de M10-008 (solo en memoria) a propósito.
- Uso propio del técnico. Sin GPS, sin datos de clientes, sin envío a terceros (decisiones 0001 y 0002 siguen vigentes).

## Consecuencias
- El único lugar del código que puede encender la medición es `operational-timer-ui.js`; una prueba lo verifica.
- Lo medido queda solo en el teléfono y entra en el respaldo de `backup.js`.
- Cualquier uso de estas métricas para evaluar desempeño sigue requiriendo política institucional (M10-001).
