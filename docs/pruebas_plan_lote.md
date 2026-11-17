# Pruebas de validación de plan en el lote — PARTE 3

Matriz ejecutada contra la API en `http://localhost:8000` (rama `feature/matricula-mejorada`, sobre la Parte 2 `d1c896d`). Las credenciales se enviaron por los encabezados `X-Usuario` / `X-Clave` y **no se publican en este documento**.

Fecha de ejecución: 2026-11-17 · Periodo vigente usado: **2026-2** (2026-11-01 → 2026-12-20).

## Qué se construyó (alcance de la Parte 3)

- **Validación de plan en `POST /matriculas/lote`** (`backend/app/routers/matriculas.py`, nuevo paso 2b, **antes de insertar nada**): el endpoint ahora consulta el programa del estudiante (paso 1 trae `id_programa` y el nombre del programa) y rechaza con **422** cualquier materia del carrito que no esté en `plan_estudios` de **ese programa**, con el nombre de la materia y el nombre del programa en el mensaje. Nada del carrito se guarda si una materia falla.
- **Cierre del hueco de la auditoría**: la validación es por **programa**, no por facultad. Antes de esta parte el lote no validaba plan ni facultad (aceptaba cualquier materia existente, incluso de otro programa de la misma facultad). Con la Parte 1 el carrito del estudiante ya solo ofrecía materias de su plan; ahora el servidor también lo garantiza aunque la petición venga por otra vía.
- No se tocó ninguna migración (V1–V8 intactas), ni tareas, ni notas.

## Pruebas de la corrida (resultados reales, 10/10)

| # | Prueba | Petición | Resultado real | Estado |
|---|--------|----------|----------------|--------|
| P1 | Línea base: 1001 con 4 matrículas, 2001 con 0 | — | valores capturados (con pre-limpieza defensiva) | ✅ |
| S0 | API disponible | `GET /health` | **200** | ✅ |
| **T3** | **Materia de otro programa en el lote → 422** (la prueba pendiente de la Parte 1) | `POST /matriculas/lote` (1001 de Sistemas, [EN01]) | **422** `"Materias fuera del plan de estudios: 'Fundamentos de Enfermería' no pertenece al plan de 'Ingeniería de Sistemas'"`; 0 filas insertadas | ✅ **AHORA PASA** |
| T3b | Misma **facultad**, otro **programa** → 422 (el hueco de la auditoría, cerrado) | `POST /matriculas/lote` (1001 de Sistemas, [IC01] — IC01 es de F01 Ingeniería, la misma facultad) | **422** `"…'Introducción a la Ingeniería Civil' no pertenece al plan de 'Ingeniería de Sistemas'"`; 0 filas insertadas | ✅ |
| T3c | Lote mixto [B01, EN01] → 422 solo por EN01 y **B01 tampoco se crea** | `POST /matriculas/lote` | **422**; 1001 sigue con sus 4 matrículas | ✅ |
| T3d | Lote válido del plan sigue funcionando | `POST /matriculas/lote` (1001, [B01]) | **201**, matrícula creada | ✅ |
| E1 | Materia inexistente no la enmascara la validación de plan | `POST /matriculas/lote` (1001, [XX99]) | **404** `"Una o más materias del carrito no existen"` (comportamiento previo intacto) | ✅ |
| E2 | Enfermería (2001) con materia de Ingeniería → 422 | `POST /matriculas/lote` (admin, 2001, [B01]) | **422** `"…'Cálculo 1' no pertenece al plan de 'Enfermería'"` | ✅ |
| E3 | Camino positivo para 2001: [EN01, EN02] (en su plan) → 201 | `POST /matriculas/lote` (admin) | **201**, 2 matrículas creadas | ✅ |
| L1 | Limpieza final | — | 1001 vuelve a 4 matrículas, 2001 a 0 | ✅ |

## Repetición de las suites de las Partes 1 y 2 (3.4)

| Suite | Resultado | Detalle |
|-------|-----------|---------|
| **Parte 1** (`probar_plan.py`) | **13/13 ✅** | La prueba T3, que quedaba pendiente, ahora **pasa** (422). El resto intacto: plan de 13 materias para Sistemas, 8 para Enfermería, estados Aprobada/Matriculada/Disponible, 404 de inexistente, limpieza OK |
| **Parte 2** (`probar_requisitos.py`) | **22/22 ✅** | Requisitos previos completos: B05 sin B01 aprobado → 422; con B01 aprobado (a mano y calculada por momento) → 201; frontera 3.00; datos de Sistemas y Enfermería; atomicidad; BD final intacta |

**Resultado total: 45/45 pruebas (10 nuevas + 13 de la Parte 1 + 22 de la Parte 2).**

## Verificación en el portal (navegador)

- **Estudiante (1001) — Matricular:** la vista sigue cargando las 13 materias del plan de Sistemas con su carrito y contador de créditos. Consola: **0 errores**. La validación nueva no cambia la interfaz (el carrito solo ofrece materias del plan); la garantía ahora está en el servidor.
- Las demás vistas del portal no cambian en esta parte.

## Notas de reproducibilidad

- No requiere migración ni datos nuevos: usa la tabla `plan_estudios` de la Parte 1 (V7).
- El orden de validación del lote quedó: periodo → estudiante/programa → repetidas en carrito → **plan del programa (2b)** → existencia/créditos → duplicados contra la base → cupos → **requisitos previos (4c)** → insertar. Cualquier fallo aborta sin insertar.
- La materia inexistente sigue devolviendo 404 (paso 3), no 422, igual que antes.
