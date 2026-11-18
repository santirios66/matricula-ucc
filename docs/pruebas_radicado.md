# Pruebas de cabecera de matrícula y radicado — PARTE 5

Matriz ejecutada contra la API en `http://localhost:8000` (rama `feature/matricula-mejorada`, sobre la Parte 4 `2c6d9c7`). Las credenciales se enviaron por los encabezados `X-Usuario` / `X-Clave` y **no se publican en este documento**.

Fecha de ejecución: 2026-11-17 · Periodo vigente usado: **2026-2** (2026-11-01 → 2026-12-20).

## Qué se construyó (alcance de la Parte 5)

- **Migración `V9__matricula_cabecera.sql`** (nueva; V1–V8 intactas):
  - Tabla `matriculas_lote`: `id_lote` (PK), `radicado` (**VARCHAR(8), único, con CHECK de 8 caracteres en mayúsculas**), `cedula` (FK `estudiantes`), `periodo` (FK `periodos`), `fecha` (TIMESTAMP, por defecto `NOW()`), `estado` (VARCHAR, por defecto `'Activa'`).
  - Columna nueva `matriculas.id_lote` (FK `matriculas_lote`), **nullable**: las 4 matrículas existentes quedaron intactas y sin lote (verificado al aplicar la migración: 4 filas, 0 con `id_lote`).
- **`POST /matriculas/lote` (5.2)**: dentro de la misma transacción y justo antes de insertar, crea la fila en `matriculas_lote` con un **radicado nuevo generado de un `uuid4`** (8 hex en mayúsculas; reintenta si chocara con un duplicado, casi imposible) — **no sale de la primera fila del estudiante**. Todas las materias del carrito se insertan con ese `id_lote`; si algo falla después, el rollback descarta también la cabecera. La respuesta del lote ahora incluye `id_lote` y `radicado`.
- **Recibo PDF (5.3)**: `generar_pdf_matricula` ahora recibe el **periodo**; el endpoint `GET /pdf/matricula/{cedula}` lo pide por query param `?periodo=` (si se omite, usa el **más reciente con matrículas**, que es lo que el botón actual del portal ya obtiene sin cambios). El recibo:
  - muestra **solo las materias de ese periodo** y su total de créditos;
  - toma el **radicado del lote del periodo consultado** (el más reciente si hubo varios lotes en el periodo, con nota que lo indica);
  - si alguna matrícula del periodo **no tiene `id_lote`** (anteriores a esta parte), muestra el aviso *"una o más matrículas de este periodo son anteriores a los lotes y no tienen radicado asignado"* y en la caja **`Radicado: Sin radicado`** cuando no hay ninguno — **sin inventar radicado**.
- No se tocó V1–V8, `escritorio/`, `backend/.env`, tareas ni notas; SQL solo con `%s`.

## Pruebas de la corrida (resultados reales, 10/10)

La suite es re-ejecutable: pre-limpieza defensiva (borra matrículas con lote de 1001, sus cabeceras y los PDFs de prueba de `backend/`) y verificación de que la BD vuelve a la línea base (1001 con sus 4 matrículas originales sin `id_lote`: M01/M03 en `2026-2`, M01/M02 en `2026-02`). El texto del PDF se extrae descomprimiendo sus streams (`/ASCII85Decode` + `/FlateDecode` → zlib).

| # | Prueba | Petición | Resultado real | Estado |
|---|--------|----------|----------------|--------|
| P0 | Pre-limpieza y línea base (0 cabeceras, 1001: 4 matrículas sin lote, 2026-2 = [M01, M03]) | SQL (psycopg2) | valores confirmados | ✅ |
| S0 | API disponible | `GET /health` | **200** | ✅ |
| **T1** | **Un lote nuevo genera su cabecera con radicado nuevo** | `POST /matriculas/lote` (1001, [B01]) | **201** con `radicado=1C471F78` (8 mayúsculas) y `id_lote=e6151fd7`; radicado **distinto** del id de la primera matrícula (`C906392E`) y del `id_lote`; fila en `matriculas_lote` con cedula=1001, periodo=2026-2, estado='Activa' y fecha no nula; la matrícula creada apunta a ese `id_lote` | ✅ |
| **T2** | **Otro lote genera un radicado distinto** | `POST /matriculas/lote` (1001, [IS01]) | **201** con `radicado=42C129A2` ≠ `1C471F78`; en la tabla hay 2 cabeceras y **2 radicados distintos** | ✅ |
| **T3** | **El recibo de 2026-2 no muestra materias de otro periodo** | `GET /pdf/matricula/1001?periodo=2026-2` | **200** PDF; contiene el radicado del lote más reciente (`42C129A2`) y NO el del primero; muestra **B01, IS01, M01, M03** (todas de 2026-2); **no muestra M02** (está en `2026-02`); total de créditos **13** (4+2+4+3); aviso de matrículas anteriores sin lote presente | ✅ |
| **T4** | **Las matrículas anteriores sin `id_lote` se muestran con el aviso, sin romperse** | `GET /pdf/matricula/1001?periodo=2026-02` | **200** PDF; muestra **M01 y M02** (todas de 2026-02); **ninguno de los dos radicados de los lotes aparece** y la caja dice **`Radicado: Sin radicado`**; aviso visible | ✅ |
| T5 | Sin `?periodo` usa el periodo más reciente con matrículas | `GET /pdf/matricula/1001` | **200** PDF de 2026-2: radicado `42C129A2` presente, M02 ausente (la forma exacta en que el botón del portal llama al endpoint sigue funcionando) | ✅ |
| T6 | Periodo sin matrículas → 404 claro | `GET /pdf/matricula/1001?periodo=2025-1` | **404** `"El estudiante no tiene materias matriculadas en el periodo '2025-1'."` | ✅ |
| T7 | Formato y unicidad de todos los radicados | SQL | los 2 radicados cumplen 8 caracteres en mayúsculas y son únicos (`['1C471F78', '42C129A2']`) | ✅ |
| L1 | Limpieza final | — | 0 cabeceras, 1001 vuelve a sus 4 matrículas sin `id_lote`, 2001 en 0, PDFs de prueba de `backend/` borrados | ✅ |

## Repetición de las suites de las Partes 1 a 4 (5.4)

Las cuatro suites de regreso se corren completas después de la Parte 5 (con sus limpiezas actualizadas para borrar las cabeceras de lote huérfanas, incluida la previa al borrado del estudiante de prueba por la FK `matriculas_lote.cedula`):

| Suite | Resultado |
|-------|-----------|
| **Parte 1** (`probar_plan.py`) | **13/13 ✅** |
| **Parte 2** (`probar_requisitos.py`) | **22/22 ✅** |
| **Parte 3** (`probar_plan_lote.py`) | **10/10 ✅** |
| **Parte 4** (`probar_cupos.py`) | **14/14 ✅** (concurrencia real, solapamiento 3/3 y en la de créditos) |

**Resultado total: 69/69 pruebas (10 nuevas + 59 de regreso).**

## Notas de reproducibilidad

- V9 es idempotente (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`); aplicarla de nuevo no cambia nada.
- Orden del lote quedó: validaciones → locks (Parte 4) → créditos → duplicados → cupos → requisitos → **cabecera del lote (V9) → inserts con `id_lote`**. Cualquier fallo aborta sin insertar nada (la cabecera también).
- El recibo se genera en el directorio de trabajo de la API (`backend/`); la suite borra los PDFs de prueba al terminar.
- El botón "Descargar recibo" del portal no cambió: el endpoint sin `?periodo` devuelve el recibo del periodo más reciente con matrículas (para 1001, 2026-2).
