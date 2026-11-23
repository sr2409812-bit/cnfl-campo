# Formatos de listados PDF

El lector en uso es `lectura-pdf-v4.js`; `parseReadingPdfLayout` (`lectura-pdf-v4.js:276`) prueba los formatos en orden. Los archivos `lectura-pdf.js`, `-v2`, `-v3` y `-hotfix` no los carga ninguna página.

Principio del lector (estricto): si no puede comprobar que leyó **todos** los registros, no carga nada. Es preferible bloquear una jornada que cargar una incorrecta. La salida de emergencia en campo es **"Ingresar lista manualmente"** (formato `Localización Medidor`, una por línea).

| Formato | Función | Uso |
|---|---|---|
| LMR0050 | `parseLMR0050RouteListPdf` (`:203`) | Listado de medidores a visitar de la ruta (lectura de demanda) |
| LMR0085 | `parseInspectionReadingPdf` (`:116`) | Inspecciones |
| Tabla de medidores sin lectura | `parseMissingReadingTablePdf` (`:195`) | Residencial |
| Etiquetado / columnas | `parseLabeledReadingPdf` (`:76`), `parseReadingPdfColumns` (`:131`) | Demanda y otros |

Detalle por formato: [lmr0050.md](lmr0050.md). Los demás formatos se documentan cuando haya un cambio o incidente que los toque.

Validación: `validation/reading-pdf/README.md` (51 PDFs sintéticos con pdf.js real).
