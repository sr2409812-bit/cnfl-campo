# Base de conocimiento de CNFL Campo

Memoria técnica del proyecto: lo que se sabe, lo que se corrigió y lo que se decidió, con su fuente. Sirve para que cualquier persona o agente (Claude, Codex, auditorías automáticas) trabaje **sin suponer datos**.

## Reglas de uso
1. **Fuente o no se afirma.** Cada dato lleva su fuente: archivo y línea, commit, PR, issue o decisión del propietario con fecha.
2. Lo que no tiene fuente se marca **No verificado** y no se usa para decidir.
3. **Repositorio público:** aquí no van datos de campo. Nada de localizaciones, medidores, NIS, nombres de clientes, direcciones, coordenadas, referencias de edificios o zonas, ni claves de acceso. Los ejemplos son ficticios y se marcan como tales. El conocimiento operativo sensible vive en la base privada del propietario (proyecto de Claude), no aquí.
4. **Se actualiza solo por PR.** Ningún agente escribe directo en `main`; propone por PR en borrador y el propietario aprueba.
5. Si el código y este documento no coinciden, **manda el código**: se corrige el documento en el mismo PR que lo detecte.
6. Las decisiones no se editan para cambiar su sentido: se agrega una decisión nueva que la reemplaza.

## Índice
| Documento | Contenido |
|---|---|
| [reglas.md](reglas.md) | Reglas de ingeniería y flujo de un cambio |
| [arquitectura.md](arquitectura.md) | Páginas, scripts, almacenamiento, service worker, pruebas |
| [glosario.md](glosario.md) | Tipos de orden, códigos de resultado, sellos, campos |
| [formatos-pdf/](formatos-pdf/) | Formatos de listados que lee la app y sus trampas conocidas |
| [areas/](areas/) | Una ficha por área de la app |
| [decisiones/](decisiones/) | Decisiones del propietario, numeradas |
| [incidentes/](incidentes/) | Fallos de campo: causa, arreglo y evidencia |
| [aprendizajes.md](aprendizajes.md) | Patrones de trabajo y lecciones |
| [pendientes.md](pendientes.md) | Deuda técnica y trabajo abierto |
| [auditorias/](auditorias/) | Informes de las auditorías automáticas |

## Quién la mantiene
- **Propietario:** aprueba todo cambio.
- **Auditorías automáticas** (diaria 4:32 a.m. y semanal domingo 7:58 p.m., hora de Costa Rica): la leen antes de auditar, registran hallazgos e incidentes y proponen actualizaciones por PR en borrador.
- **Cualquier PR** que cambie comportamiento actualiza la ficha del área correspondiente.

Creada: 2026-11-23.
