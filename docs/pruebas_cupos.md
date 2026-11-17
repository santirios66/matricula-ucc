# Pruebas de bloqueo de cupos y créditos (concurrencia) — PARTE 4

Matriz ejecutada contra la API en `http://localhost:8000` (rama `feature/matricula-mejorada`, sobre la Parte 3 `c423008`). Las credenciales se enviaron por los encabezados `X-Usuario` / `X-Clave` y **no se publican en este documento**.

Fecha de ejecución: 2026-11-17 · Periodo vigente usado: **2026-2** (2026-11-01 → 2026-12-20).

## Qué se construyó (alcance de la Parte 4)

- **Bloqueos `SELECT ... FOR UPDATE` en `POST /matriculas/lote`** (`backend/app/routers/matriculas.py`, nuevo paso 3, **dentro de la transacción y antes de contar**). Orden fijo de bloqueo, siempre el mismo para evitar interbloqueos:
  1. **Fila del estudiante** (`FOR UPDATE`): actúa como mutex por estudiante. Es necesaria porque un `SELECT ... FOR UPDATE` que no encuentra filas no bloquea nada: dos lotes de un estudiante **sin matrículas previas** no se habrían serializado bloqueando solo `matriculas`.
  2. **Sus matrículas del periodo** (las que existan, por `id_matricula`).
  3. **Las materias del carrito por `id_materia` ascendente** (siempre el mismo orden): dos lotes que pegan por el último cupo se serializan en esa fila; el que espera cuenta los cupos **después** de que el otro confirmó, y ve sus filas.
- Los conteos (créditos del periodo, duplicados, cupos) corren **después** de los locks, en sentencias separadas, sobre datos ya confirmados por el lote que esperó.
- **La validación existente se mantiene** (4.4): sin cupo → **409**; créditos del periodo fuera de 6–19 → **422** (código que ya usaba el endpoint; el enunciado decía 409 para ambos, se conservó el 422 de créditos porque era el comportamiento existente — si se prefiere unificar a 409, es un cambio de una línea). En cualquier fallo no se inserta nada.
- No se tocó ninguna migración (V1–V8 intactas), ni tareas, ni notas, ni `backend/.env`.

## ¿La concurrencia fue real? **SÍ — real, con evidencia**

Dos **hilos de Python** (`threading.Barrier` para dispararlos a la vez) envían **dos POST HTTP simultáneos**. Cada request lo atiende uvicorn en su propio hilo (el endpoint es `def`, thread pool) y `database.py` abre una **conexión psycopg2 nueva por request** → **dos backends de PostgreSQL concurrentes**, no una cola.

Evidencia registrada por la corrida:

| Evidencia | Valor observado |
|---|---|
| Solapamiento temporal de los dos requests (ventanas `t_inicio–t_fin` que se cruzan) | **3/3 rondas** de la carrera de cupos y **sí** en la de créditos |
| Duración de cada request en paralelo | ~2.2–2.3 s **cada uno**, no ~4.4 s serializados |
| Ganador de la carrera | Varió entre rondas: **1001, 3001, 3001** (no hay orden fijo — no es una secuencia programada) |
| Mensaje del perdedor | `409 "La materia '...' no tiene cupos disponibles ... (1 de 1)"` — llegó al conteo **después** de que el ganador confirmó su INSERT |

Nota sobre los ~2.2 s por request: `seguridad.py` verifica la clave con **PBKDF2 de 200.000 iteraciones** (~2 s de CPU por request autenticado). Que ambos hilos terminen en ~2.2 s simultáneos (y no ~4.4 s en total) demuestra que se ejecutaron en paralelo; el hashing domina el tiempo y la espera por el lock se suma encima.

## Pruebas de la corrida (resultados reales, 14/14)

Datos de prueba creados y **borrados por la propia suite**: materia **PT01** ("Prueba de cupos (se borra)", 3 créditos, **cupos = 1**, en el plan de P01) y estudiante **3001** (Sistemas). Para que el perdedor de la carrera llegue al check de **cupos** y no muera antes en el mínimo de créditos, la suite matricula primero una previa de 3001: **[B01, IS01] = 6 créditos** (1001 ya tenía 7 créditos en 2026-2 con M01 + M03, créditos reales de la BD).

| # | Prueba | Petición | Resultado real | Estado |
|---|--------|----------|----------------|--------|
| P0 | Pre-limpieza y línea base (33 materias, 34 filas de plan, 1001 con 4 matrículas) | — | valores confirmados | ✅ |
| S0 | API disponible | `GET /health` | **200** | ✅ |
| S1 | Estudiante de prueba 3001 (P01) listo | `POST /estudiantes/` (admin) | **201** | ✅ |
| S2 | PT01 con **cupos = 1** y fila en plan de P01 | SQL (psycopg2) | creada | ✅ |
| S3 | Previa de 3001 [B01, IS01] → 6 créditos | `POST /matriculas/lote` (admin) | **201**, suma 6 | ✅ |
| C1 r1 | **Dos lotes simultáneos por el último cupo** | 2 hilos → 1001 y 3001, ambos [PT01] | **[201, 409]**, cupo 1/1, perdedor `409 "no tiene cupos disponibles (1 de 1)"`, solapados, 2.24 s / 2.32 s | ✅ |
| C1 r2 | Ídem (el cupo se libera entre rondas) | ídem | **[201, 409]**, ganador 3001, solapados | ✅ |
| C1 r3 | Ídem | ídem | **[201, 409]**, ganador 3001, solapados | ✅ |
| C1 total | 3/3 rondas con un único ganador y cupo respetado | — | ganadores = 1001, 3001, 3001 | ✅ |
| C1d-1 | Camino secuencial: 1001 toma el único cupo | `POST /matriculas/lote` (1001, [PT01]) | **201**, cupo 1/1, total 7+3 = 10 créditos | ✅ |
| C1d-2 | Otro estudiante con el cupo lleno → 409 (validación intacta) | `POST /matriculas/lote` (3001, [PT01]) | **409** `"no tiene cupos disponibles ... (1 de 1)"`, 3001 sigue en 6 créditos | ✅ |
| **C2** | **Dos lotes simultáneos del MISMO estudiante que juntos superan 19** | 2 hilos → 3001 con A = [B02, B03, B04, IS02] = 13 cr y B = [IS04, IS06, IS07] = 11 cr | **[201, 422]**: ganador B (6+11 = **17** créditos), perdedor **422** `"El total de créditos del periodo '2026-2' es 30 (17 matriculados + 13 del carrito); debe estar entre 6 y 19"` — contó los créditos **confirmados** del ganador | ✅ |
| C3 | El flujo normal no se rompió con los locks | `POST /matriculas/lote` (1001, [B01]) | **201** | ✅ |
| L1 | Limpieza final: BD idéntica al estado inicial | — | 33 materias, 34 filas de plan, 2 estudiantes, 1001+2001 = 4 matrículas | ✅ |

**Nota de diseño de C2:** los carritos evitan las materias con requisito (B05, IS03, IS05) y la previa de 3001 (B01, IS01) para que el único motivo de fallo posible sean los créditos: 13 + 11 + 6 = 30 > 19, mientras cada carrito solo queda en 19 o 17 (válido).

## Repetición de las suites de las Partes 1, 2 y 3

| Suite | Resultado | Detalle |
|-------|-----------|---------|
| **Parte 1** (`probar_plan.py`) | **13/13 ✅** | Plan de 13 materias para Sistemas, 8 para Enfermería, estados, T3 (422 desde la Parte 3), limpieza OK |
| **Parte 2** (`probar_requisitos.py`) | **22/22 ✅** | Requisitos completos, ruta calculada por momento, frontera 3.00, BD final intacta |
| **Parte 3** (`probar_plan_lote.py`) | **10/10 ✅** | Validación de plan por programa, lote mixto, 404, caminos positivos |

**Resultado total: 59/59 pruebas (14 nuevas + 45 de regreso).**

## Notas de reproducibilidad

- No requiere migración ni datos nuevos: PT01 y 3001 se crean y se borran solos en cada corrida; la suite es re-ejecutable (pre-limpieza defensiva).
- Orden de validación del lote quedó: periodo → estudiante/programa → repetidas en carrito → plan del programa → **locks FOR UPDATE (estudiante → matrículas del periodo → materias por id_materia ASC)** → créditos (6–19) → duplicados → cupos → requisitos → insertar. Cualquier fallo aborta sin insertar.
- Los códigos HTTP de cupos (409) y créditos (422) son los que ya existían; no se cambió ninguno en esta parte.
