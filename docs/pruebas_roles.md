# Pruebas de roles y reglas de negocio

Matriz ejecutada contra la API en `http://localhost:8000` (código de `feature/sistema-completo`), con cuentas de la BD local de demo. Las credenciales se enviaron por los encabezados `X-Usuario` / `X-Clave` y **no se publican en este documento**: en un entorno real cada usuario solo conoce su propia clave (el admin puede generar claves temporales con `/auth/crear-cuenta-*` o `/auth/restablecer-clave`).

Fecha de ejecución: 2026-11-13 · Periodo vigente usado: **2026-2** (2026-11-01 → 2026-12-20).

## Matriz de pruebas

| # | Prueba | Rol / usuario | Resultado | Estado |
|---|--------|---------------|-----------|--------|
| 1 | `POST /facultades/` crea F99 | Administrador | **201** con la facultad creada | ✅ PASÓ |
| 2 | `POST /facultades/` intento de crear F98 | Estudiante (1001) | **403** `Permiso denegado: se requiere rol Administrador` | ✅ PASÓ |
| 3 | `POST /matriculas/` con `cedula: 1002` | Estudiante (1001) | **403** `Solo puedes matricular tu propia cédula` (se evalúa antes de validar que 1002 exista) | ✅ PASÓ |
| 4 | `GET /notas/` | Estudiante (1001) | **200**, 2 filas; comparado con el listado del admin (2 filas totales): **0 notas fuera de su cédula** | ✅ PASÓ |
| 5 | `POST /notas/` sobre matrícula de materia de PR02 | Profesor (PR01) | **403** `La materia 'M02' no es tuya; solo puedes registrar notas en tus materias` | ✅ PASÓ |
| 6 | Login con usuario inexistente | público | **401** `Usuario o contraseña incorrectos` | ✅ PASÓ |
| 7 | Login con clave incorrecta | admin | **401** `Usuario o contraseña incorrectos` | ✅ PASÓ |
| 8 | Matrícula sin cupo | Administrador | Se creó materia de prueba con `cupos=1` y se matriculó al primer estudiante (201); el segundo intento devolvió **409** `La materia 'Materia cupo test' no tiene cupos disponibles en el periodo '2026-2' (1 de 1)` | ✅ PASÓ |
| 9 | Matrícula fuera de fecha | Administrador | Periodo cerrado 2025-1: **422** con el rango y la fecha de hoy; periodo inexistente 2025-9: **422** `no existe o no está abierto para matrícula` | ✅ PASÓ |
| 10 | Recibo PDF muestra radicado y periodo | Administrador (PDF de 1001) | **200**, PDF de 2316 bytes; texto interno verificado: `Radicado: D8CCCAB4`, `Periodo`, `Fecha de matrícula`, `2026-2` y `TOTAL CRÉDITOS` | ✅ PASÓ |

Pruebas adicionales ejecutadas (no estaban en la matriz original):

| # | Prueba | Resultado | Estado |
|---|--------|-----------|--------|
| 11 | Estudiante intenta `POST /notas/` | **403** `Un estudiante no puede registrar notas` | ✅ PASÓ |
| 12 | Admin crea `POST /periodos/` (2026-3) | **201** con el periodo creado | ✅ PASÓ |
| 13 | Estudiante intenta `POST /periodos/` | **403** `Permiso denegado: se requiere rol Administrador` | ✅ PASÓ |

**Resultado global: 13 de 13 pruebas pasaron.** Ninguna fila falló.

## Cómo se verificó el PDF

El recibo se descargó con `GET /pdf/matricula/1001` y se decomprimió el stream (`ASCII85Decode` + `FlateDecode`) para inspeccionar el texto: contiene el radicado `D8CCCAB4` (primeros 8 caracteres del `id_matricula` del primer registro del periodo, en mayúsculas), el periodo `2026-2`, la fecha de matrícula y el total de créditos.

## Limpieza posterior

Los artefactos creados solo para las pruebas se eliminaron de la BD: la matrícula de prueba (`3ff1d32c`), la materia `MT1`, el estudiante `1002`, la facultad `F99` y los periodos `2025-1` y `2026-3`. Los datos de la demo quedan intactos.
