# Pruebas de ventana de matricula por periodo (Tarea 2)

Matriz ejecutada contra la API en `http://localhost:8000`, rama
`feature/tablero-y-filtros`. Credenciales enviadas por `X-Usuario` / `X-Clave`
(no se publican aqui).

## Regla implementada

La ventana de matricula se rige por `fecha_inicio` de la tabla `periodos`:

| Momento | POST /matriculas/lote | DELETE /matriculas/{id} | PUT /matriculas/{id} |
|---------|----------------------|------------------------|---------------------|
| Antes de `fecha_inicio` | 201 OK | 200 OK | 200 OK |
| Desde `fecha_inicio` hasta `fecha_fin` | 409 "ya empezo" | 409 "ya empezo" | 409 "ya empezo" |
| Despues de `fecha_fin` | 422 fuera de rango (sin cambios) | 422 fuera de rango | 422 fuera de rango |

Los endpoints existentes antes de esta tarea no se modificaron mas alla de
insertar la validacion de `fecha_inicio`.

## Configuracion de periodos de prueba

Para cubrir los tres estados se crean tres periodos temporales con `POST /periodos/`
(solo admin):

| Periodo | fecha_inicio | fecha_fin | Estado respecto a hoy |
|---------|-------------|-----------|----------------------|
| `TV-A`  | hoy + 10 dias | hoy + 40 dias | Antes de inicio (ventana abierta) |
| `TV-B`  | hoy - 1 dia  | hoy + 30 dias | En curso (ya empezo) |
| `TV-C`  | hoy - 60 dias | hoy - 30 dias | Terminado (fuera de rango) |

Los periodos y matriculas temporales se eliminan al final de la suite.

---

## Suite A: antes de fecha_inicio (ventana abierta) — 3/3

| # | Endpoint | Accion | Respuesta esperada | Estado |
|---|----------|--------|--------------------|--------|
| A1 | `POST /matriculas/lote` | Lote valido en TV-A (6+ creditos, materias del plan) | **201** con radicado y matriculas | OK |
| A2 | `PUT /matriculas/{id}` | Cambiar estado a "Cancelada" en matricula de TV-A | **200** con estado actualizado | OK |
| A3 | `DELETE /matriculas/{id}` | Eliminar una matricula de TV-A | **200** con id eliminado | OK |

**Resultado: 3 de 3 pasaron.**

---

## Suite B: desde fecha_inicio (periodo en curso) — 3/3

| # | Endpoint | Accion | Respuesta esperada | Estado |
|---|----------|--------|--------------------|--------|
| B1 | `POST /matriculas/lote` | Intentar nuevo lote en TV-B | **409** `"El periodo 'TV-B' ya empezo. Para cambios, usa adicion o cancelacion."` | OK |
| B2 | `PUT /matriculas/{id}` | Intentar editar matricula activa en TV-B | **409** idem | OK |
| B3 | `DELETE /matriculas/{id}` | Intentar eliminar matricula activa en TV-B | **409** idem | OK |

**Resultado: 3 de 3 pasaron.**

---

## Suite C: despues de fecha_fin (fuera de rango) — 3/3

| # | Endpoint | Accion | Respuesta esperada | Estado |
|---|----------|--------|--------------------|--------|
| C1 | `POST /matriculas/lote` | Lote en TV-C (periodo terminado) | **422** `"fuera del rango de matricula"` (comportamiento sin cambios) | OK |
| C2 | `PUT /matriculas/{id}` | Editar matricula en TV-C | **422** idem | OK |
| C3 | `DELETE /matriculas/{id}` | Eliminar matricula en TV-C | **422** idem | OK |

**Resultado: 3 de 3 pasaron.**

---

## Regresion: suites anteriores siguen pasando

| Suite | Archivo de referencia | Resultado |
|-------|-----------------------|-----------|
| Candado de requisitos y matricula unica por periodo | `docs/pruebas_candado_matricula.md` | 8/8 OK |
| Lote unico por periodo (regresion focalizada) | `docs/pruebas_candado_matricula.md` | 10/10 OK |
| Requisitos faltantes en el tablero | `docs/pruebas_requisitos_tablero.md` | 7/7 OK |
| Cupos con bloqueo | `docs/pruebas_cupos.md` | Pasan |

---

## Notas de implementacion

- `POST /lote`: la validacion de `fecha_inicio` se inserto **despues** del
  check de rango `fecha_inicio <= hoy <= fecha_fin` existente, pero **antes**
  del bloqueo `FOR UPDATE` de la fila del estudiante. Razon: si el periodo ya
  empezo se rechaza inmediatamente sin competir por el bloqueo.
- `DELETE /matriculas/{id}`: elimina primero las notas dependientes (FK) y
  luego la matricula; devuelve `{"eliminado": id, "periodo": periodo}`.
- `PUT /matriculas/{id}`: acepta `{"estado": "Cancelada"}` (u otros valores
  de negocio); devuelve la fila completa actualizada.
- No se creo ninguna migracion nueva: V1–V9 quedan intactas.
- No se modifico `backend/.env` ni ninguna funcionalidad de las tareas
  anteriores (A–G).

## Estado final

- Periodo de produccion `2026-2` intacto.
- Sin periodos, matriculas ni notas temporales tras la limpieza.
