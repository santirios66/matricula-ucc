# Pruebas de edición del plan de estudios (admin) — PARTE 6A

Matriz ejecutada contra la API en `http://localhost:8000` (rama `feature/matricula-mejorada`, sobre la Parte 5 `71bd928`). Las credenciales se enviaron por los encabezados `X-Usuario` / `X-Clave` y **no se publican en este documento**.

Fecha de ejecución: 2026-11-17 · Periodo vigente usado: **2026-2**.

## Qué se construyó (alcance de la Parte 6A)

- **Router nuevo `backend/app/routers/plan.py`** (registrado en `main.py`; sin migraciones, V1–V9 intactas) con los cuatro endpoints, **todos solo para Administrador** (`require_admin`, 403 para los demás roles):
  - **`GET /programas/{id_programa}/plan`** — materias del plan con `id_materia`, `nombre_curso`, `creditos`, `semestre` y `obligatoria`, ordenadas por semestre; 404 si el programa no existe.
  - **`POST /programas/{id_programa}/plan`** — agrega `{id_materia, semestre (1–10), obligatoria}`; **409** si ya está en el plan, **404** si no existe el programa o la materia, 422 si el semestre sale de 1–10.
  - **`PUT /programas/{id_programa}/plan/{id_materia}`** — cambia `semestre` y/o `obligatoria` (al menos uno; sin cambios → 422); 404 si el programa no existe o la materia no está en el plan.
  - **`DELETE /programas/{id_programa}/plan/{id_materia}`** — quita la materia del plan; **404** si no está; **409** si otra materia **del mismo plan** depende de ella como requisito previo (el mensaje incluye el nombre de la materia que depende).
- **Reglas 6A.2 (verificadas en las pruebas):** los cambios de plan **no tocan matrículas, notas ni tareas ya guardadas** (solo cambian las materias disponibles de ahora en adelante, porque `materias-disponibles` y la validación de plan del lote leen `plan_estudios` en el momento de la consulta); una matrícula de una materia que se quita del plan **se conserva**; el bloqueo de requisitos al quitar solo aplica dentro del mismo plan (B01 puede salir del plan de Enfermería aunque B05 de Sistemas/Civil la exija, porque B05 no está en ese plan).
- SQL solo con `%s` (el `UPDATE` dinámico de `PUT` arma solo nombres de columna fijos; los valores van por parámetro).
- No se tocó V1–V9, `escritorio/`, `backend/.env`, tareas ni notas. La pantalla del admin es la Parte 6B (no se hizo).

## Pruebas de la corrida (resultados reales, 16/16)

La suite es re-ejecutable: pre-limpieza defensiva (quita restos de B01 en el plan de P02 y matrículas de 2001 en B01) y verificación de la línea base (plan 34 filas, P02 = EN01–EN08, 1001 con 4 matrículas, 2001 con 0, 33 materias, 7 requisitos, 0 cabeceras de lote).

| # | Prueba | Petición | Resultado real | Estado |
|---|--------|----------|----------------|--------|
| P0 | Pre-limpieza y línea base | SQL (psycopg2) | plan=34, P02=[EN01..EN08], mat_1001=4, mat_2001=0, lotes=0, materias=33, requisitos=7 | ✅ |
| S0 | API disponible | `GET /health` | **200** | ✅ |
| T1 | **GET plan de Enfermería** con semestre y obligatoria | `GET /programas/P02/plan` | **200** con las 8 materias EN01–EN08 (EN01 sem 1 obligatoria; EN08 sem 8; EN05 electiva, `obligatoria=false`), cada fila con `nombre_curso` y `creditos` | ✅ |
| T2 | Programa inexistente | `GET /programas/P99/plan` | **404** `No existe el programa con ID 'P99'` | ✅ |
| T3 | **Admin agrega una materia al plan de Enfermería** | `POST /programas/P02/plan` `{B01, sem 2, obligatoria}` | **201** con `'Cálculo 1'`, 4 créditos; fila `(2, True)` en `plan_estudios` | ✅ |
| T4 | Duplicada | `POST` otra vez B01 | **409** `La materia 'Cálculo 1' (B01) ya está en el plan de 'Enfermería'` | ✅ |
| T5 | Materia / programa inexistentes | `POST` con `ZZ99` y con `P99` | **404** y **404** con mensajes claros | ✅ |
| T6 | Semestre fuera de rango | `POST` con semestre 0 y 11 | **422** en ambos (el plan solo acepta 1–10) | ✅ |
| T7 | **La materia agregada aparece en disponibles de 2001** | `GET /estudiantes/2001/materias-disponibles` | **200** con **9** materias: B01 presente con `estado=Disponible` y `semestre=2` (el resto sigue siendo EN01–EN08) | ✅ |
| T8 | PUT cambia semestre/obligatoria | `PUT /programas/P02/plan/B01` | **200** `(sem 3, obligatoria False)` en la respuesta y en la BD; segundo `PUT {obligatoria: true}` → **200** conservando sem 3 | ✅ |
| T9 | PUT inválido | `PUT` sin campos → `PUT` de IS01 (fuera del plan de P02) | **422** `No se enviaron cambios…` y **404** `La materia 'IS01' no está en el plan de 'Enfermería'` | ✅ |
| **T10** | **Quitar del plan conserva la matrícula existente** | `POST /matriculas/` (2001, B01, 2026-2) → `DELETE /programas/P02/plan/B01` | Matrícula **201** (id `2690566a`); DELETE del plan **200** `La materia 'Cálculo 1' (B01) salió del plan de 'Enfermería'. Las matrículas, notas y tareas ya guardadas no cambian.`; después: B01 **fuera** de disponibles de 2001 (quedan 8, todas EN), **la matrícula sigue existiendo** con `estado=Activa`, fila en BD `('Activa', None)` (id_lote NULL: el POST individual no crea cabecera) | ✅ |
| **T11** | **Admin intenta quitar un requisito → 409** | `DELETE /programas/P02/plan/EN03` y `DELETE /programas/P01/plan/B01` | **409** `No se puede quitar 'Bioquímica' (EN03) del plan de 'Enfermería': 'Farmacología' (EN04) depende de ella como requisito previo` (EN03 sigue en el plan) y **409** `No se puede quitar 'Cálculo 1' (B01) del plan de 'Ingeniería de Sistemas': 'Cálculo 2' (B05) depende de ella como requisito previo` | ✅ |
| **T12** | **Estudiante intenta usar estos endpoints → 403** | 1001 (y PR01) contra los 4 endpoints | **403/403/403/403** (GET/POST/PUT/DELETE) `Permiso denegado: se requiere rol Administrador`; profesor GET → **403** | ✅ |
| T13 | DELETE de lo que ya no está | `DELETE` de B01 en P02 (ya quitada) y de EN01 en P99 | **404** `no está en el plan…` y **404** `No existe el programa…` | ✅ |
| L1 | Limpieza final | — | plan=34 (P02 = EN01–EN08, sin B01), mat_1001=4, mat_2001=0, lotes=0, materias=33, requisitos=7 | ✅ |

## Repetición de las suites de las Partes 1 a 5 (6A.3)

| Suite | Resultado |
|-------|-----------|
| **Parte 1** (`probar_plan.py`) | **13/13 ✅** |
| **Parte 2** (`probar_requisitos.py`) | **22/22 ✅** |
| **Parte 3** (`probar_plan_lote.py`) | **10/10 ✅** |
| **Parte 4** (`probar_cupos.py`) | **14/14 ✅** (concurrencia real) |
| **Parte 5** (`probar_radicado.py`) | **10/10 ✅** |

**Resultado total: 85/85 pruebas (16 nuevas + 69 de regreso).**

## Notas de reproducibilidad

- La validación del lote (`POST /matriculas/lote`, paso 2b de la Parte 3) y el endpoint `materias-disponibles` (Parte 1) leen `plan_estudios` al momento de la consulta: **no hubo que cambiarlos** para que el plan editable surta efecto.
- El bloqueo del 409 por requisitos consulta `requisitos` **cruzado con el plan del mismo programa**: una materia que es requisito de materias de *otros* planes puede quitarse de este plan sin problema (T10 lo demuestra con B01 en P02, aunque B05 de P01/P03 la exige).
- El `DELETE` de plan no tiene FKs apuntando a `plan_estudios`, así que nunca arrastra matrículas, notas ni tareas.
- El semestre válido (1–10) lo valida el modelo Pydantic (`Field(ge=1, le=10)`) → 422 automático.
