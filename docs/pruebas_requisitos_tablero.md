# Pruebas de requisitos faltantes en materias disponibles (tablero)

Matriz ejecutada el **2026-11-18** contra la API en `http://localhost:8000`, rama `feature/tablero-y-filtros` (último commit de frontend `fa8b646`). Las credenciales se enviaron por los encabezados `X-Usuario` / `X-Clave` y **no se publican en este documento**.

## Alcance

`GET /estudiantes/{cedula}/materias-disponibles` ahora agrega a cada materia:

- `requisitos`: lista de objetos `{id_materia, nombre_curso}` tomados de la tabla `requisitos` (tabla V8). Lista vacía si la materia no exige requisitos.
- `requisitos_faltantes`: subconjunto de `requisitos` cuya definitiva es menor que 3.0 o no existe. Usa la misma regla del estado **Aprobada** (notas a mano y definitivas calculadas desde tareas con momento, vía `calcular_notas_por_momento`).
- `bloqueada`: `true` cuando `requisitos_faltantes` tiene elementos; `false` en caso contrario.

No se cambió el estado (`Aprobada`, `Matriculada`, `Disponible`) ni se retiraron materias de la lista. El SQL usa placeholders `%s` y `ANY(%s)`; no se usaron f-strings. No se tocaron frontend, migraciones ni `backend/.env`.

## Pruebas del endpoint (7/7)

La prueba con Cálculo 1 aprobado usó un estudiante temporal (`T9001`, programa P01) con una matrícula y una nota de 4.0 en B01. El estudiante y sus datos se eliminaron al final y se verificó que no quedaran filas.

| # | Prueba | Resultado real | Estado |
|---|--------|----------------|--------|
| S1 | **Cálculo 2 (B05) para 1001 sin Cálculo 1 aprobado** | `bloqueada: true`; `requisitos` y `requisitos_faltantes` = `[{"id_materia":"B01","nombre_curso":"Cálculo 1"}]`; estado `Disponible` | ✅ |
| S1b | Se mantienen todos los campos anteriores | 13 materias, 19 campos por materia; los 16 campos previos siguen presentes | ✅ |
| S3 | **Materia sin requisitos** (B01 e IS01) | `requisitos: []`, `requisitos_faltantes: []`, `bloqueada: false` | ✅ |
| S2 | **Cálculo 2 para un estudiante con Cálculo 1 aprobado** (T9001, nota 4.0) | `requisitos` = `[{"id_materia":"B01","nombre_curso":"Cálculo 1"}]`; `requisitos_faltantes: []`; `bloqueada: false`; estado `Disponible` | ✅ |
| S2b | La materia aprobada del estudiante temporal se refleja en la respuesta | B01: estado `Aprobada`, definitiva `4.0` | ✅ |
| S3b | **Una materia bloqueada no se retira de la lista** | B05 sigue presente; el estudiante temporal recibe 13 de 13 materias | ✅ |
| L1 | Limpieza del estudiante temporal | 0 estudiantes y 0 matrículas con la cédula temporal | ✅ |

**Resultado: 7 de 7 pruebas pasaron.**

Ejemplo real de la respuesta para B05/1001:

```json
{
  "id_materia": "B05",
  "nombre_curso": "Cálculo 2",
  "estado": "Disponible",
  "requisitos": [{"id_materia": "B01", "nombre_curso": "Cálculo 1"}],
  "requisitos_faltantes": [{"id_materia": "B01", "nombre_curso": "Cálculo 1"}],
  "bloqueada": true
}
```

Ejemplo real para una materia sin requisitos (B01/1001):

```json
{
  "id_materia": "B01",
  "nombre_curso": "Cálculo 1",
  "estado": "Disponible",
  "requisitos": [],
  "requisitos_faltantes": [],
  "bloqueada": false
}
```

## Suites de las Partes 1 a 6A (85/85)

Se ejecutaron las suites existentes de las seis entregas contra la API local, de forma secuencial. Todas terminaron con la base de datos en su estado inicial (1001: 4 matrículas/2 notas; 2001: 0 matrículas; 33 materias; 34 filas de plan; 7 requisitos; 15 tareas; 0 lotes; B01 sin profesor).

| Parte | Suite | Resultado |
|-------|-------|-----------|
| 1 | Plan de estudios por programa (V7) | **13/13** ✅ |
| 2 | Requisitos previos (V8) | **22/22** ✅ |
| 3 | Validación de plan en el lote | **10/10** ✅ |
| 4 | Bloqueo de cupos y créditos (concurrencia) | **14/14** ✅ |
| 5 | Cabecera de matrícula y radicado (V9) | **10/10** ✅ |
| 6A | Edición del plan de estudios (admin) | **16/16** ✅ |

**Total: 85 de 85 pruebas pasaron.**

## Verificación final

- `GET /estudiantes/1001/materias-disponibles` responde **200** con **13** materias y **19** campos por materia.
- B05/1001 conserva `estado: "Disponible"` y devuelve `bloqueada: true` con Cálculo 1 como faltante.
- La base quedó igual al estado inicial de demo; no quedaron estudiantes, matrículas, notas, tareas, lotes ni materias temporales.
- No se modificaron archivos de frontend, migraciones existentes ni `backend/.env`.
