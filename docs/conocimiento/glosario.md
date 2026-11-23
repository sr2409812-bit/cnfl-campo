# Glosario operativo

Fuente: propietario (técnico de campo), salvo que se indique otra cosa. Sin datos de clientes ni de zonas.

## Tipos de orden
Corte · Reconexión · Lectura · Inspección · Notificación. Cada orden tiene un número de trámite único. Las incompletas se reprograman. El supervisor monitorea en tiempo real: la reconexión se emite apenas el cliente paga.

## Códigos de resultado
| Código | Significado |
|---|---|
| 04 | Corte exitoso |
| 0501 | Portón cerrado |
| 0502 | Cliente notificado (el más común) |
| 0504 | Cliente ya pagó |
| ZP | Zona peligrosa |
| OK | Completado |

`501` como código de medidor = medidor dentro de la propiedad o no accesible. **No es una lectura.**

## Sellos
- Verde: reconexión o sellado tras inspección.
- Rojo: corte o servicio liquidado.

## Campos de una orden
Trámite, cliente, NISE, número de medidor, fábrica o marca, localización, lectura anterior, monto adeudado, tipo de orden.

## Localización
Código de 10 dígitos: 2 de control + 4 de manzana + 4 de cuenta. En los PDF puede venir sin ceros a la izquierda. Las cuentas inician en la esquina sureste de cada manzana (dato operativo del propietario, No verificado en código).

La correspondencia entre códigos de control y zonas reales es conocimiento operativo: vive en la base privada, no aquí.

## Reporte diario
Conteo de órdenes por código de resultado.

## Restricciones de campo
- No inventar coordenadas, lecturas ni controles.
- No usar logo ni marca oficial de CNFL sin autorización.
- Hay zonas sin señal: la app debe funcionar sin conexión.
- Las rutas no se ordenan solo ascendente ni por línea recta ignorando las vías reales.
- El prototipo no sustituye las herramientas oficiales de CNFL.
