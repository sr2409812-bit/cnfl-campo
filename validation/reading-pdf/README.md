# Tarea 014 — Validación con PDF binario y PDF.js real

Validación del PR #36, sin acceso a datos reales, producción ni documentos de clientes. Los documentos son **completamente ficticios**, no copias anonimizadas de PDFs reales. Los genera ReportLab 4.4.9 con metadatos deterministas y una marca visible de documento ficticio.

Se ejecutan `getDocument`, `getPage` y `getTextContent` de **PDF.js 3.11.174**, la misma distribución/version de CDN usada por la aplicación. No se simulan el PDF, su texto, sus coordenadas ni el analizador. El ejecutor verifica los SHA-256 del lector y del worker antes de comenzar.

## Resultados

| Formato sintético | PDF binarios | Importaciones válidas | Bloqueos esperados | Registros de las cargas válidas |
| --- | ---: | ---: | ---: | ---: |
| Demanda | 18 | 6 | 12 | 31 |
| Residencial (tabla de medidores sin lectura) | 18 | 6 | 12 | 31 |
| Inspecciones LMR0085 | 15 | 7 | 8 | 34 |
| **Total** | **51** | **19** | **32** | **96** |

Resultado final: **51/51 casos aprobados**. Las 96 parejas Localización/Medidor de las cargas válidas coinciden exactamente con el manifiesto; se conservan los ceros iniciales. Ninguna utiliza el Contrato ficticio `654321` como Medidor. Los 32 casos inseguros se bloquean tanto en el analizador como en `handleReadingPdfUpload`, incluso cuando un primer archivo válido ya había sido leído.

Se verifican totales correctos, ausentes, cero, menores y mayores; medidores de seis y siete dígitos con todos los grupos de prefijos aportados; columnas intercambiadas/cercanas; fichas incompletas; conflictos; candidatos ambiguos; archivos de varias páginas; páginas sin encabezado o sin estructura verificable; encabezados y valores desalineados.

## Fallos encontrados y corregidos dentro del PR #36

Sobre el commit `3f32f3263a3b92b176717fc40982c70e554ff7c1`, **45/51** casos pasaban y seis fallaban:

- Cuatro PDFs (Demanda/Residencial, encabezado Contrato elevado o bajado seis puntos) conseguían importar `654321` como Medidor cuando el medidor estaba ausente. La selección de encabezados permitía 35 puntos entre Localización y Medidor, pero solo dos para los vecinos. Se aplica una banda coherente a los encabezados vecinos, limitada por la primera fila de datos.
- Dos PDFs LMR0085 válidos, con el valor del medidor desplazado seis puntos arriba/abajo, eran rechazados. La agrupación de fichas usa ahora ocho puntos, en consonancia con la tolerancia del analizador de inspecciones original. Se mantienen las comprobaciones de etiquetas únicas y de integridad.

La suite habitual añade dos pruebas de regresión para estos casos: **`node --test`: 121/121** (67 originales, 52 de la primera implementación y dos adicionales). También pasan `node --check lectura-pdf-v4.js`, `node --check validation/reading-pdf/run.cjs` y `git diff --check`.

## Evidencia versionada

- [Antes de corregir](evidence/before.json): hashes de los PDF, filas incorrectamente aceptadas, errores y seis fallos.
- [Después de corregir](evidence/after.json): 51 resultados, cantidades, localizaciones, medidores, bloqueos y comprobaciones del flujo de carga.
- [PDF binarios y manifiesto](evidence/pdf-fixtures.zip): los 51 archivos exactos usados antes y después de corregir. Una segunda generación reprodujo los 51 hashes.
- Cada informe registra el SHA-256 del código del analizador realmente ejecutado, de los dos componentes de PDF.js y de cada PDF binario, además de la versión de Node.
- El generador produce `manifest.json` con las parejas esperadas. El ejecutor guarda el texto y los `TextItem` reales (incluidas las coordenadas) en `extractions/`, junto al informe elegido.

## Reproducir

Desde la raíz del repositorio, con Python 3 y Node (la ejecución documentada utilizó Node v24.19.0):

```bash
python -m venv /tmp/cnfl-t014-venv
/tmp/cnfl-t014-venv/bin/pip install reportlab==4.4.9
mkdir -p /tmp/cnfl-t014-pdfjs
curl --fail --location https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js -o /tmp/cnfl-t014-pdfjs/pdf.min.js
curl --fail --location https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js -o /tmp/cnfl-t014-pdfjs/pdf.worker.min.js
/tmp/cnfl-t014-venv/bin/python validation/reading-pdf/generate.py /tmp/cnfl-t014-pdfs
node validation/reading-pdf/run.cjs /tmp/cnfl-t014-pdfs /tmp/cnfl-t014-pdfjs /tmp/cnfl-t014-results/after.json
node --test
```

El proceso de validación termina con código distinto de cero si una cantidad, localización, medidor, hash, bloqueo o postcondición no coincide. Para reproducir el resultado anterior, ejecutar el mismo validador con `lectura-pdf-v4.js` del commit inicial indicado, en una copia temporal aislada del repositorio.

También se puede omitir ReportLab y la generación: extraer los PDF ya versionados con `python -m zipfile -e validation/reading-pdf/evidence/pdf-fixtures.zip /tmp/cnfl-t014-pdfs` y ejecutar el lector y el validador anteriores.

## Alcance de las comprobaciones del flujo

El entorno DOM y `localStorage` son simulados y están aislados; **PDF.js y el analizador son reales**. El worker se carga desde disco en Node, usando el mismo binario fijado por la aplicación; no se sustituye su extracción. En cada rechazo, se comparan hashes del estado completo antes/después: órdenes, lecturas, fechas, notas, GPS, metadatos, historial y otra clave de almacenamiento. No queda una importación pendiente de confirmar.

Para Residencial/Inspecciones también se comprueban revisión, cancelación y confirmación, preservando la visita previa. Para Demanda se comprueban los valores exactos entregados al cargador existente y su única invocación; no se afirma haber probado su persistencia en un navegador.

Esta validación no es una prueba de producción, ni una certificación de todos los diseños posibles de PDF, ni OCR. La comprobación sin total depende de la estructura textual extraída. No se incorporó soporte LMR0475, no se modificó el PR #33, y no se fusionó ni desplegó el PR #36. La validación binaria se ejecuta con el comando independiente anterior; no añade dependencias a la aplicación ni cambia el workflow de CI existente.
