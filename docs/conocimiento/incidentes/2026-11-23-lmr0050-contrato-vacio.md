# 2026-11-23 · LMR0050 rechazado: "indica 44 registros, pero pude validar 43"

| | |
|---|---|
| Área | Lecturas |
| Severidad | Alta: bloqueaba la carga de la jornada |
| Detectado | En campo, por el propietario, al cargar el listado del día |
| Resuelto | PR #56, fusionado en `main` como `4dcdaae` |
| Publicado | Verificado en GitHub Pages (`CACHE_NAME` `cnfl-campo-v72`) el mismo día |

## Síntoma
La app mostró: *"El listado LMR0050 indica 44 registros, pero pude validar 43. No lo cargué para evitar una jornada incorrecta."*

## Causa (verificada)
La expresión `record` de `parseLMR0050RouteListPdf` exigía un valor de Contrato (`*******` o número) entre la localización y `MED`. Una fila del listado real traía la columna Contrato **vacía**. La fila se detectaba pero no se validaba, y la regla de integridad rechazaba el PDF completo.

## Mitigación en campo
"Ingresar lista manualmente" con los pares `Localización Medidor` extraídos del PDF.

## Arreglo
- `lectura-pdf-v4.js`: Contrato opcional; MED + Medidor siguen obligatorios.
- `tests/lmr0050-demand.test.cjs`: acepta Contrato vacío y conserva el medidor; bloquea Contrato vacío + medidor ausente.
- `lectura.html` y `lectura-residencial.html`: `?v=20261123-lmr0050-contrato-vacio`.
- `sw.js`: `CACHE_NAME` v71 → v72 (el SW ignora `?v=`).

## Evidencia
- PDF real del propietario: 43 → 44/44. El PDF no se versionó ni se guardó.
- `node --test`: 160/160. La prueba nueva falla con el lector anterior y pasa con el arreglo.
- `validation/reading-pdf`: 51/51.
- CI de GitHub en verde; revisión automática de Codex.

## Lecciones
- Los listados reales pueden traer columnas vacías sin marcador. Distinguir "vacío permitido" (Contrato) de "vacío bloqueante" (Medidor).
- Un cambio en un archivo precargado necesita `CACHE_NAME` nuevo, no solo `?v=`.
- Pendiente: agregar un caso de Contrato vacío al generador de `validation/reading-pdf`.
