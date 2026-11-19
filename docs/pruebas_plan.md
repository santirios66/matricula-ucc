# Pruebas de plan de estudios por programa (V7) — PARTE 1

Matriz ejecutada contra la API en `http://localhost:8000` (rama `feature/matricula-mejorada`, base `main` con la ronda de notas por momento ya fusionada, PR #14). Las credenciales se enviaron por los encabezados `X-Usuario` / `X-Clave` y **no se publican en este documento**.

Fecha de ejecución: 2026-11-16 · Periodo vigente usado: **2026-2** (2026-11-01 → 2026-12-20).

## Qué se probó (alcance de la Parte 1)

- **Migración `backend/migrations/V7__plan_estudios.sql`** (nueva; no toca V1–V6): tabla `plan_estudios` con clave primaria compuesta `(id_programa, id_materia)`, FK a `programas` y `materias`, `semestre INT` con CHECK entre 1 y 10 y `obligatoria BOOLEAN NOT NULL DEFAULT TRUE`; y columna `programas.plan_referencia BOOLEAN NOT NULL DEFAULT TRUE`.
- **Datos de referencia** (`backend/scripts/cargar_plan_referencia.py`, separado de la migración): tres programas de referencia — Ingeniería de Sistemas (P01, F01 Ingeniería), Ingeniería Civil (P03, F01) y Enfermería (P02, F02 Salud) — marcados con `plan_referencia = TRUE` (los demás programas quedan FALSE). Sistemas y Civil comparten solo las materias base de ingeniería (B01 Cálculo 1, B02 Física 1, B03 Programación 1, B04 Álgebra Lineal, B05 Cálculo 2); cada programa tiene materias propias del semestre 1 al 8 (códigos IS01–IS08, IC01–IC08, EN01–EN08; IS06 y EN05 quedan como electivas de ejemplo). El script reinicia **solo** los planes de los tres programas: no borra estudiantes, matrículas ni notas, y no toca las materias M01–M04 del demo antiguo (tareas y notas siguen intactas).
- **Endpoint `GET /estudiantes/{cedula}/materias-disponibles`** (`backend/app/routers/estudiantes.py`): ahora devuelve solo las materias del plan del programa del estudiante (antes devolvía toda la facultad), con el semestre, si es obligatoria y el estado académico: `Aprobada` (definitiva ≥ 3.0 en notas registradas a mano **o** calculadas desde las tareas con momento, misma regla de Mis notas), `Matriculada` (matrícula Activa en cualquier periodo) o `Disponible`. Mantiene los campos que ya consumía el portal (`id_materia`, `nombre_curso`, `creditos`, `cupos`, `horario`, `id_profesor`), así que la vista de matrícula no se rompe.

## Pruebas de la corrida (resultados reales)

| # | Prueba | Petición | Resultado real | Estado |
|---|--------|----------|----------------|--------|
| S0 | API disponible | `GET /health` | **200** | ✅ PASÓ |
| S1 | Estudiante de Enfermería para las pruebas | `POST /estudiantes/` (admin, `2001`, programa P02) | **201** creado (si ya existe, se acepta 409) | ✅ PASÓ |
| T1a | Estudiante de Sistemas (1001) ve **sus materias del plan** | `GET /estudiantes/1001/materias-disponibles` | **200** con 13 materias: B01–B05 (base) e IS01–IS08 (propias) | ✅ PASÓ |
| T1b | …y **no las de Civil** | mismo GET | Ninguna materia `IC*` ni `EN*` en la respuesta | ✅ PASÓ |
| T1c | Cada materia trae semestre, obligatoria y estado | mismo GET | Todas las filas con `semestre` (int 1–10), `obligatoria` (bool), `estado` ∈ {Aprobada, Matriculada, Disponible} | ✅ PASÓ |
| T1d | Semestres y electiva correctos | mismo GET | B01 sem 1 obligatoria; B04 y B05 sem 2; IS08 sem 8; IS06 con `obligatoria=false` | ✅ PASÓ |
| T1e | Todas las filas del programa correcto | mismo GET | `id_programa=P01` en las 13 filas | ✅ PASÓ |
| T2 | Estudiante de Enfermería **no ve materias de Ingeniería** | `GET /estudiantes/2001/materias-disponibles` | **200** con exactamente EN01–EN08; cero materias B/IS/IC | ✅ PASÓ |
| T3 | **Materia de otro programa en el lote → 422 esperado** | `POST /matriculas/lote` (1001 con EN01) | **422** `Materias fuera del plan de estudios: 'Fundamentos de Enfermería' no pertenece al plan de 'Ingeniería de Sistemas'` — resuelto en la **PARTE 3** (ver `docs/pruebas_plan_lote.md`) | ✅ PASA (desde la Parte 3) |
| E1 | Estudiante inexistente | `GET /estudiantes/9999/materias-disponibles` | **404** `No existe el estudiante con cédula '9999'` | ✅ PASÓ |
| E2a | Estado **Matriculada** dentro del plan | lote con B01 + mismo GET | **201** y B01 aparece `estado="Matriculada"` | ✅ PASÓ |
| E2b | Estado **Aprobada** con notas a mano | `POST /notas/` (4.0/4.5/3.5) + mismo GET | **201** y B01 aparece `estado="Aprobada"` con `definitiva=4.0` | ✅ PASÓ |
| L1 | Limpieza de datos de prueba | — | Matrículas y notas creadas por el suite eliminadas (la BD demo quedó con sus 4 matrículas originales) | ✅ PASÓ |

**Resultado: 12 de 13 pruebas pasaron al cierre de la Parte 1. La única que fallaba era T3 por alcance: el rechazo de materias fuera del plan en el lote se implementó en la Parte 3 ("validación de plan en lote"); hoy el lote la rechaza con 422 y la prueba pasa (13/13 al repetir la suite, ver `docs/pruebas_plan_lote.md`). El dato creado por esa prueba se eliminó para dejar la BD limpia.**

## Verificación de la interfaz (navegador)

- **Estudiante (1001) — Matricular:** la vista carga las 13 materias del plan de Sistemas (Cálculo 1, Física 1, Programación 1, Álgebra Lineal, Cálculo 2, IS01–IS08) con sus créditos y cupos; el carrito y el contador de créditos funcionan igual que antes (el portal consume los mismos campos). Consola: **0 errores**.
- Las demás vistas del portal no cambian en esta parte.

## Notas de reproducibilidad

- Aplicar `backend/migrations/V7__plan_estudios.sql` después de V1–V6 (es idempotente).
- Correr `backend/scripts/cargar_plan_referencia.py` con el `python` del venv (lee `backend/.env`); puede repetirse sin duplicar datos.
- El endpoint `materias-disponibles` sigue siendo de consulta pública (así lo era antes de V7 y así lo consume el portal sin credenciales); el endurecimiento de permisos no está en el alcance de esta parte.
- Las materias M01–M04 (tareas, notas y matrículas del demo) permanecen fuera de los planes de referencia a propósito: el script no las borra ni las modifica.
