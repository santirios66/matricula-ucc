# Pruebas de ventana, edición de materias e historial de matrículas

Documento actualizado el **2026-11-20** contra la API local
`http://127.0.0.1:8000`, rama `feature/tablero-y-filtros` (commits `34fb79d`,
`8a231b5` y `d6dd142`). Las credenciales se enviaron por los encabezados
`X-Usuario` / `X-Clave` y no se publican en este documento.

Las suites usaron periodos, estudiantes, matrículas y notas temporales. Al
final se eliminaron todos los datos de prueba y la base quedó en la línea base.

## 1. Regla de ventana por `fecha_inicio`

La regla se evalúa con la fecha del servidor (`date.today()`) y las fechas del
periodo en la tabla `periodos`:

| Momento | `POST /matriculas/lote` | `PUT /matriculas/{id}` | `DELETE /matriculas/{id}` |
|---------|-------------------------|------------------------|---------------------------|
| `hoy < fecha_inicio` | **201** si el lote es válido | **200** | **200** |
| `fecha_inicio <= hoy <= fecha_fin` | **409** `"El periodo '<periodo>' ya empezo. Para cambios, usa adicion o cancelacion."` | **409** con el mismo mensaje | **409** con el mismo mensaje |
| `hoy > fecha_fin` | **422** `"fuera del rango de matricula"` | **422** con el mismo mensaje | **422** con el mismo mensaje |
| El periodo no existe | **422** `"no existe o no está abierto para matrícula"` | **422** `"no existe"` | **422** `"no existe"` |

El orden real de las validaciones de `POST /matriculas/lote` es:

1. El periodo existe.
2. Si `hoy > fecha_fin`, responde **422** por estar fuera del rango.
3. El estudiante existe.
4. Si `hoy >= fecha_inicio`, responde **409** con el mensaje de "ya empezo".
5. Si el estudiante ya tiene una matrícula `Activa` en el mismo periodo,
   responde **409** con el mensaje de adición/cancelación.
6. Si tiene una matrícula `Activa` en un periodo que contiene la fecha de hoy,
   responde **409** con el mensaje de "matricula en curso".
7. Continúan las validaciones de plan, cupos, requisitos, créditos y horario.

La regla de matrícula única por periodo sigue activa, pero solo se alcanza
cuando la solicitud es para un periodo que todavía no ha comenzado. Para un
periodo en curso, el paso 4 responde primero con el mensaje de ventana.

### Periodos temporales usados

Fechas calculadas con `hoy = 2026-11-20`:

| Periodo | `fecha_inicio` | `fecha_fin` | Uso |
|---------|----------------|-------------|-----|
| `T26-P1-A` | 2026-11-30 | 2026-12-30 | Antes de inicio: lote permitido |
| `T26-P1-B` | 2026-11-20 | 2026-12-20 | `hoy == fecha_inicio`: 409 |
| `T26-P1-C` | 2026-09-21 | 2026-10-21 | Terminado: 422 |
| `T26-P1-D` | 2026-10-21 | 2026-11-20 | `hoy == fecha_fin`: 409 |
| `T26-P2-A` | 2026-11-30 | 2026-12-30 | Edición antes de inicio |
| `T26-P2-C` | 2026-09-21 | 2026-10-21 | Edición en periodo terminado |
| `T26-P3-C` | 2026-09-21 | 2026-10-21 | Historial de periodo cerrado |

## 2. Punto 1: `POST /matriculas/lote` (14/14)

Se usó el estudiante `2001` (sin matrículas) para el lote válido y el estudiante
`1001` (con matrículas activas en `2026-2`) para la regla de matrícula en curso.
Todos los casos negativos verificaron que no se insertaran matrículas.

| # | Caso | Resultado real | Estado |
|---|------|----------------|--------|
| 1 | Crear `T26-P1-A` | **201** | OK |
| 2 | Crear `T26-P1-B` (inicio hoy) | **201** | OK |
| 3 | Crear `T26-P1-C` (terminado) | **201** | OK |
| 4 | Crear `T26-P1-D` (fin hoy) | **201** | OK |
| 5 | `1001` con matrícula en curso en `2026-2` pide un lote futuro en `T26-P1-A` | **409** `"El estudiante '1001' tiene una matricula en curso en el periodo '2026-2' (finaliza el 2026-12-20); no puede volver a matricular por lote hasta que termine el semestre actual."`; `1001` conserva sus 4 matrículas | OK |
| 6 | `2001` pide un lote válido en `T26-P1-A` (antes de inicio) | **201** con 3 matrículas, 10 créditos y radicado | OK |
| 7 | `2001` repite el lote en `T26-P1-A` | **409** `"El estudiante '2001' ya tiene una matricula activa en el periodo 'T26-P1-A'..."`; no inserta filas | OK |
| 8 | `2001` pide un lote en `2026-2` (en curso) | **409** `"El periodo '2026-2' ya empezo. Para cambios, usa adicion o cancelacion."` | OK |
| 9 | `2001` pide un lote en `T26-P1-B` (`hoy == fecha_inicio`) | **409** con el mensaje exacto de "ya empezo" | OK |
| 10 | `2001` pide un lote en `T26-P1-D` (`hoy == fecha_fin`) | **409** con el mensaje exacto de "ya empezo" | OK |
| 11 | `2001` pide un lote en `T26-P1-C` (terminado) | **422** `"El periodo 'T26-P1-C' esta fuera del rango de matricula (2026-09-21 a 2026-10-21); hoy es 2026-11-20"` | OK |
| 12 | `2001` pide un lote en `T26-NO-EXISTE` | **422** `"no existe o no está abierto para matrícula"` | OK |
| 13 | Verificación en base de datos | Solo quedaron las 3 matrículas de `2001` en `T26-P1-A` | OK |
| 14 | Limpieza | `2001` sin matrículas y 0 periodos temporales | OK |

**Resultado: 14 de 14 pruebas pasaron.**

## 3. Punto 2: `PUT /matriculas/{id}` (24/24)

### Contrato implementado

`PUT /matriculas/{id}` acepta un cuerpo con campos opcionales:

```json
{
  "id_materias": ["EN01", "EN02", "EN05"],
  "estado": "Activa"
}
```

- Si se envía `id_materias`, la lista se interpreta como el conjunto completo
  de materias del estudiante en el periodo de la matrícula referenciada:
  agrega las que faltan y elimina las que no estén.
- Al eliminar una materia se eliminan primero sus notas dependientes para no
  violar la llave foránea.
- Si la materia de la fila referenciada se elimina y hay materias nuevas, se
  reutiliza su `id_matricula` para la primera materia nueva. Si no hay materias
  nuevas, la respuesta devuelve la primera fila que quede y el
  `id_matricula` puede cambiar.
- Se validan rol y propiedad, ventana de `fecha_inicio`, lista no vacía, materias
  repetidas, materias inexistentes, plan de estudios, total de créditos entre 6
  y 19, cupos de las materias nuevas, requisitos previos y cruce de horario.
- Si se envía `estado` sin `id_materias`, se conserva el comportamiento anterior:
  solo cambia el estado de la fila referenciada. Si se envían ambos, el estado
  se aplica a todas las filas del estudiante en ese periodo.
- La respuesta incluye la fila actualizada, `total_creditos` y la lista
  `materias` con `id_matricula`, `id_materia`, `creditos` y `estado`.

Los casos negativos no dejan cambios parciales: la transacción se revierte y las
materias originales quedan intactas.

### Pruebas ejecutadas

| # | Caso | Resultado real | Estado |
|---|------|----------------|--------|
| 1 | Crear `T26-P2-A` | **201** | OK |
| 2 | Crear `T26-P2-C` | **201** | OK |
| 3 | Lote inicial de `2001` en `T26-P2-A` con `EN01`, `EN02`, `EN03` | **201**, 10 créditos, 3 matrículas | OK |
| 4 | `PUT` con `EN01`, `EN02`, `EN03`, `EN05` | **200**, 13 créditos, agrega `EN05` y conserva el `id_matricula` ancla | OK |
| 5 | `PUT` con `EN01`, `EN02`, `EN03`, `EN05`, `EN06` | **422** `"Requisitos previos sin aprobar: 'Enfermería del Adulto Mayor' requiere 'Salud Comunitaria' aprobada..."` | OK |
| 6 | Verificación tras el rechazo por requisito | Las 4 materias anteriores siguen intactas | OK |
| 7 | `PUT` con `EN01` y `M01` (materia de otro programa) | **422** `"Materias fuera del plan de estudios..."` | OK |
| 8 | `PUT` con `EN01` repetida | **409** `"La lista de materias tiene materias repetidas"` | OK |
| 9 | `PUT` con una materia inexistente | **404** `"Una o mas materias de la lista no existen"` | OK |
| 10 | `PUT` solo con `EN01` (3 créditos) | **422** `"El total de creditos de la matricula es 3; debe estar entre 6 y 19"` | OK |
| 11 | `PUT` con `EN01`, `EN02`, `EN05` | **200**, 10 créditos; quita `EN03` y borra su nota dependiente | OK |
| 12 | `PUT` con `EN01`, `EN02` | **200**, 7 créditos; quita `EN05` | OK |
| 13 | `PUT` con `{"estado": "Cancelada"}` sin `id_materias` | **200**, estado `Cancelada` en la fila referenciada | OK |
| 14 | `PUT` con `{"estado": "Activa"}` | **200**, estado restaurado | OK |
| 15 | `PUT` con `EN01`, `EN02`, `EN03` | **200**, 10 créditos; agrega `EN03` para poder quitar el ancla | OK |
| 16 | `PUT` con `EN02`, `EN03` | **200**, 7 créditos; elimina el ancla y devuelve la fila de `EN02` | OK |
| 17 | `PUT` con `EN01`, `EN02`, `EN03` | **200**, 10 créditos; vuelve a agregar `EN01` sobre la fila viva | OK |
| 18 | `PUT` con `EN01`, `EN03`, `EN05` | **200**, 9 créditos; reutiliza el ancla para `EN05` y conserva su `id_matricula` | OK |
| 19 | `PUT` sobre una matrícula de `1001` en `2026-2` | **409** `"El periodo '2026-2' ya empezo. Para cambios, usa adicion o cancelacion."` | OK |
| 20 | `PUT` sobre una matrícula de `2001` en `T26-P2-C` (terminado) | **422** `"fuera del rango de matricula"` | OK |
| 21 | Lote de `T920A` (programa P01) en `T26-P2-A` con `B01`, `B03` | **201**, 7 créditos | OK |
| 22 | `PUT` de `T920A` con `B01`, `B02` (cruce miércoles 14:00-16:00) | **422** `"Cruce de horario..."` | OK |
| 23 | Verificación tras el rechazo por horario | `T920A` conserva `B01` y `B03` | OK |
| 24 | Limpieza | 0 matrículas de prueba, 0 estudiante temporal y 0 periodos temporales | OK |

**Resultado: 24 de 24 pruebas pasaron.**

## 4. Punto 3: `GET /estudiantes/{cedula}/matriculas?periodo=` (11/11)

### Contrato implementado

El endpoint requiere autenticación. El propio estudiante o un administrador
pueden consultar; un profesor recibe **403**. La respuesta tiene esta forma:

```json
{
  "cedula": "1001",
  "periodo": "2026-2",
  "periodo_abierto": true,
  "materias": [
    {
      "id_matricula": "fa236783",
      "id_materia": "M03",
      "nombre_curso": "Análisis Numérico",
      "creditos": 3,
      "calificacion": 3.5,
      "nota_final": 3.5,
      "estado": "Cursando"
    },
    {
      "id_matricula": "96317481",
      "id_materia": "M01",
      "nombre_curso": "Programación en Java",
      "creditos": 4,
      "calificacion": 4.0,
      "nota_final": 4.0,
      "estado": "Cursando"
    }
  ],
  "promedio_semestre": 3.79,
  "promedio_acumulado": 3.58
}
```

Reglas de cálculo:

- `calificacion` y `nota_final` exponen la misma definitiva de la materia. Se
  toma la nota registrada a mano en `notas.definitiva`; si no existe, se usa la
  definitiva calculada desde las tareas con momento (`calculo_notas.py`).
- `estado` es `Cursando` si la fecha de hoy está dentro del periodo. En un
  periodo cerrado es `Aprobada` con definitiva `>= 3.0`, `Reprobada` con
  definitiva `< 3.0` y `Sin nota` si la materia no tiene definitiva.
- `promedio_semestre` es el promedio ponderado por créditos de las materias del
  periodo que tengan nota.
- `promedio_acumulado` es el promedio ponderado por créditos de todas las
  matrículas del estudiante, incluidas las de periodos que no están en la tabla
  `periodos` si tienen nota. Las materias sin nota no se incluyen.
- Si no hay materias o ninguna tiene nota, el promedio correspondiente es
  `null`.

### Pruebas ejecutadas

| # | Caso | Resultado real | Estado |
|---|------|----------------|--------|
| 1 | `1001` en `2026-2` | **200**, `M01 = 4.0`, `M03 = 3.5`, ambas `Cursando`, `promedio_semestre = 3.79`, `promedio_acumulado = 3.58` | OK |
| 2 | El estudiante `1001` consulta su propio historial | **200** con sus 2 materias | OK |
| 3 | El estudiante `1001` consulta la cédula `2001` | **403** `"Solo puedes consultar tus propias matrículas"` | OK |
| 4 | Un profesor consulta el historial | **403** `"Solo el estudiante o el administrador pueden consultar el historial"` | OK |
| 5 | `2001` en `2026-2`, sin matrículas | **200** con `materias = []`, `promedio_semestre = null` y `promedio_acumulado = null` | OK |
| 6 | Periodo `T26-NO-EXISTE` | **422** `"El periodo 'T26-NO-EXISTE' no existe"` | OK |
| 7 | Estudiante `NOEXISTE` | **404** `"No existe el estudiante con cédula 'NOEXISTE'"` | OK |
| 8 | Periodo en blanco | **422** `"El periodo no puede estar vacío"` | OK |
| 9 | Crear `T26-P3-C` (periodo cerrado) | **201** | OK |
| 10 | `2001` en `T26-P3-C` con `EN01 = 4.0`, `EN02 = 2.5` y `EN03` sin nota | **200**, `periodo_abierto = false`; `EN01` `Aprobada`, `EN02` `Reprobada`, `EN03` `Sin nota`; `promedio_semestre = 3.14`, `promedio_acumulado = 3.14` | OK |
| 11 | Limpieza | 0 matrículas, 0 notas y 0 periodos temporales | OK |

**Resultado: 11 de 11 pruebas pasaron.**

## 5. Regresión y estado final

- Punto 1 (`POST /matriculas/lote`): **14/14**.
- Punto 2 (`PUT /matriculas/{id}`): **24/24**.
- Punto 3 (`GET /estudiantes/{cedula}/matriculas`): **11/11**.
- Los casos negativos de los tres puntos verificaron que no se insertaran ni
  modificaran filas.
- La suite histórica `docs/pruebas_candado_matricula.md` se ejecutó con periodos
  temporales que ya estaban en curso. Con la regla actual, esas solicitudes
  reciben primero el **409** de ventana (`"ya empezo"`) y no llegan a la
  validación de matrícula única. Esa validación se revalida en el punto 1 con un
  periodo futuro: el segundo lote del mismo estudiante y periodo responde
  **409** con `"ya tiene una matricula activa"`.
- Las suites antiguas que hacían varios lotes consecutivos en `2026-2` también
  quedan obsoletas por la misma regla de ventana.
- No se modificaron el esquema de PostgreSQL, `backend/.env` ni las migraciones
  existentes.
- Línea base restaurada: 2 estudiantes, 4 matrículas de `1001` (2 en `2026-02` y
  2 en `2026-2`), 2 notas, 33 materias, 34 filas de plan, 7 requisitos, 15
  tareas, 0 lotes y 1 periodo (`2026-2`). `2001` quedó sin matrículas.
- No quedaron estudiantes, periodos, matrículas ni notas temporales.
