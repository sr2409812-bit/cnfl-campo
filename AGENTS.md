# Instrucciones permanentes de ingeniería — CNFL Campo

Estas instrucciones aplican a Codex en todo el repositorio. El propietario dirige y audita; Codex ejecuta únicamente el trabajo autorizado y presenta evidencia para revisión.

## Fuente de verdad y alcance

- La aplicación actual es la fuente de verdad. Inspecciona su comportamiento y el código existente antes de proponer cambios.
- No reconstruyas ni rediseñes la aplicación. No agregues, elimines ni modifiques funcionalidades sin autorización expresa del propietario.
- Trabaja con cambios mínimos, delimitados y reversibles. Mantén el alcance de cada tarea; no aproveches una intervención para hacer cambios ajenos.
- Antes de cambiar código, verifica la rama, el HEAD, el estado del árbol de trabajo y las dependencias pertinentes. Conserva los cambios preexistentes y repórtalos; no los sobrescribas.

## Integridad de los datos de campo

- No accedas, copies, alteres ni elimines datos reales de campo salvo autorización expresa y específica para la operación. No modifiques lecturas, identificadores, fechas, rutas ni historiales reales.
- No introduzcas datos reales en pruebas, ejemplos, capturas o diagnósticos. Usa exclusivamente datos sintéticos y entornos o perfiles aislados.
- No modifiques sistemas de almacenamiento, esquemas de datos, autenticación ni permisos sin autorización expresa.
- No ejecutes operaciones destructivas. Si una acción puede comprometer la integridad de los datos o su reversibilidad, detente y solicita la decisión del propietario.
- No introduzcas secretos, credenciales ni datos sensibles en GitHub, incluidos commits, pull requests, comentarios y registros de pruebas.

## Producción y verificación

- No modifiques producción ni publiques versiones sin aprobación expresa del propietario. Abrir un pull request no autoriza fusionarlo ni desplegarlo.
- Ejecuta las pruebas pertinentes al cambio y registra el comando, el resultado y cualquier prueba pendiente. Verifica una postcondición observable cuando corresponda.
- No declares una tarea completada sin evidencia verificable. Una señal, un resultado con mocks, un health check o una respuesta `success` no demuestran por sí solos operación en vivo.
- Distingue hechos verificados, inferencias, propuestas y decisiones aprobadas. Reporta archivos modificados, riesgos, limitaciones y la siguiente acción concreta.
- Ante incertidumbre que pueda comprometer la integridad de los datos, detén la intervención y comunica el bloqueo. No supongas acceso compartido, memoria compartida ni permisos de otros agentes o herramientas.
