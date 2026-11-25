# Etapa 2b del rediseño — Waze y Maps sin señal

**Aprobado por el propietario (2026-11-25):** parte 2 de la etapa 2 (comportamiento).

## Observación del propietario
«Hoy se me fue el internet y no pude ver los links a mapa o Waze.»

## Diagnóstico
- **Verificado:** todos los botones WAZE y MAPS son enlaces web (`https://www.waze.com/ul?...` y `https://www.google.com/maps/...`) con `target="_blank"`. Están en `lectura.js:277`, `lectura-ux.js:67`, `app.js:576`, `mapa.js:115` y `notificaciones.html:149`.
- **Inferencia:** en la app instalada, ese enlace abre una pestaña del navegador. Sin internet la pestaña no carga y nunca le pasa el destino a Waze o a Maps.
- **Aparte:** si la orden no tiene coordenadas («GPS faltante»), no hay destino que pasar, con o sin señal. Eso depende de la traducción SIGEL → GPS consultada a TI.

## Cambio
- Nuevo `nav-links.js`, cargado en Cortes, Demanda, Residencial, Notificaciones y Mapa. En **Android**, al tocar un enlace con coordenadas abre la app directamente:
  - WAZE → `waze://?ll=lat,lon&navigate=yes`
  - MAPS → `geo:lat,lon?q=lat,lon` (Google Maps u otra app de mapas)
- Sin cambios en iPhone ni en computadora, en las búsquedas por dirección (sin coordenadas: necesitan red) ni en los botones deshabilitados.
- Sin GPS del teléfono, sin red y sin almacenamiento. `CACHE_NAME` → `cnfl-campo-v77`.

## Límites
- Recibir el destino no necesita señal, pero **trazar la ruta** depende de cada app: Google Maps navega sin señal si la zona está descargada (Mapas sin conexión); Waze necesita datos para calcular rutas.
- Si Waze no está instalado, el botón WAZE no abre nada. MAPS sigue funcionando.
- `geo:` puede mostrar «Abrir con…» la primera vez; se puede elegir «Siempre».

## Riesgos
- Service worker v77. Sin cambios de almacenamiento.
- En Android también cambia el comportamiento con señal: abre la app en vez de una pestaña del navegador.

## Evidencia
- `node --test`: 271/271. Pruebas nuevas en `tests/nav-links.test.cjs`, todas con coordenadas ficticias.
- Chromium con identidad de Android, Demanda con una orden ficticia con coordenadas y la conexión cortada: WAZE y MAPS no abren una pestaña web (queda 1 pestaña) y no hay errores. **No verificado en un teléfono real:** falta probarlo en el del propietario.

## Prueba en el teléfono (propietario)
1. Activá el modo avión.
2. En una orden con coordenadas, tocá WAZE: debe abrirse Waze con el destino.
3. Tocá MAPS: debe abrirse Maps (o «Abrir con…») con el punto marcado.

## Cómo revertir
Revertir el merge y subir `CACHE_NAME` a `cnfl-campo-v78`.
