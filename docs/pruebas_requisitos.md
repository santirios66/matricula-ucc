# Pruebas de requisitos previos (V8) — PARTE 2

Matriz ejecutada contra la API en `http://localhost:8000` (rama `feature/matricula-mejorada`, sobre la Parte 1 `7b062a7`). Las credenciales se enviaron por los encabezados `X-Usuario` / `X-Clave` y **no se publican en este documento**.

Fecha de ejecución: 2026-11-17 · Periodo vigente usado: **2026-2** (2026-11-01 → 2026-12-20).

## Qué se construyó (alcance de la Parte 2)

- **Migración `backend/migrations/V8__requisitos.sql`** (nueva; no toca V1–V7): tabla `requisitos` con clave primaria compuesta `(id_materia, id_requisito)`, FK de ambas columnas a `materias(id_materia)` y CHECK `id_materia <> id_requisito`. Idempotente.
- **Datos de referencia** (`backend/scripts/cargar_requisitos_referencia.py`, separado de la migración, mismo patrón del script de la Parte 1): 7 requisitos de demo — Cálculo 2 (B05) requiere Cálculo 1 (B01), base compartida de Sistemas y Civil; y ejemplos de semestres superiores con requisito del **mismo programa** del semestre anterior: IS03→IS02 e IS05→IS04 (P01), IC03→IC02 e IC06→IC05 (P03), EN04→EN03 y EN06→EN05 (P02). El script reinicia **solo** esas filas de `requisitos`: no borra estudiantes, matrículas ni notas. Antes de insertar verifica que cada pareja exista y comparta al menos un plan de estudios.
- **Validación en `POST /matriculas/lote`** (`backend/app/routers/matriculas.py`, paso 4c antes de insertar nada): si una materia del carrito tiene requisito, el estudiante debe tenerlo **aprobado** (definitiva ≥ 3.0 en notas registradas a mano **o** calculadas desde las tareas con momento, la misma regla de la Parte 1 vía `calcular_notas_por_momento`). Si falta, responde **422** con el nombre de la materia y del requisito. La regla de la Parte 1 vive en el helper `_aprobadas_por_materia` (lógica idéntica a la de `materias-disponibles`).

## Pruebas de la corrida (resultados reales, 22/22)

| # | Prueba | Petición | Resultado real | Estado |
|---|--------|----------|----------------|--------|
| P0 | Pre-limpieza defensiva (permite re-corridas) | — | 0 sobrantes (BD ya estaba limpia) | ✅ |
| P1 | Línea base: 1001 con 4 matrículas/2 notas, 2001 con 0, 15 tareas, 7 requisitos | — | valores capturados | ✅ |
| S0 | API disponible | `GET /health` | **200** | ✅ |
| S1 | Login del profesor PR01 | `POST /auth/login` | **200**, rol Profesor | ✅ |
| A1 | **Cálculo 2 sin Cálculo 1 aprobado → 422** | `POST /matriculas/lote` (1001, [B05]) | **422** `"Requisitos previos sin aprobar: 'Cálculo 2' requiere 'Cálculo 1' aprobada (definitiva >= 3.0)"`; 0 filas insertadas | ✅ |
| A2 | **Materia sin requisito → 201** (no cambia el comportamiento) | `POST /matriculas/lote` (1001, [B01]) | **201**, B01 matriculada (4 créditos) | ✅ |
| A3 | Requisito "en curso" no cuenta | `POST /matriculas/lote` (1001, [B05]) con B01 matriculada pero sin notas | **422** con los mismos nombres | ✅ |
| A4 | Lote con una materia que falla → no guarda NINGUNA | `POST /matriculas/lote` (1001, [B02, B05]) | **422**; B02 **no** fue creada (transacción intacta) | ✅ |
| A5 | Aprobar Cálculo 1 con notas a mano 4.0/4.5/3.5 | `POST /notas/` | **201**, definitiva **4.00**, estado Aprobado | ✅ |
| A6 | **Cálculo 2 con Cálculo 1 aprobado → 201** | `POST /matriculas/lote` (1001, [B05]) | **201**, matrícula creada (total 15 créditos del periodo) | ✅ |
| L_A | Limpieza del flujo A | — | 1001 vuelve a 4 matrículas / 2 notas | ✅ |
| B1–B5 | Montaje de la ruta **calculada**: B01 sin notas + tarea de quiz con momento 1 (PR01 como profesor temporal de B01) + entrega de 1001 + calificación 4.2 | `POST /tareas/`, `POST /tareas/{id}/entregas`, `PUT .../calificacion` | 201/201/200 | ✅ |
| B6 | Requisito aprobado por **definitiva calculada por momento** (4.20) | `POST /matriculas/lote` (1001, [B05]) | **201** sin notas a mano de B01 | ✅ |
| L_B | Limpieza del flujo B (tarea, entregas, matrículas, profesor temporal) | — | BD vuelve a la base; `B01.id_profesor` de nuevo NULL | ✅ |
| C3 | Frontera: requisito con definitiva **exactamente 3.00** | notas 3.0/3.0/3.0 + `POST /matriculas/lote` (1001, [B05]) | **201** (≥ 3.0 cuenta como aprobada) | ✅ |
| C4 | Datos de Sistemas: IS05 requiere IS04 sin aprobar | `POST /matriculas/lote` (1001, [IS05]) | **422** `"…'Redes de Computadores' requiere 'Bases de Datos' aprobada…"` | ✅ |
| C5 | Datos de Enfermería: EN04 requiere EN03 sin aprobar | `POST /matriculas/lote` (admin, 2001, [EN04, EN01, EN02]) | **422** `"…'Farmacología' requiere 'Bioquímica' aprobada…"`; 0 filas insertadas | ✅ |
| F1 | Estado final de la BD intacto | — | 1001: 4 mat/2 notas; 2001: 0; 15 tareas; `B01.id_profesor` NULL; 7 requisitos | ✅ |

**Resultado: 22 de 22 pruebas pasaron.** Nota honesta: en la primera corrida C5 devolvió 403 porque el suite lo pedía con la sesión del estudiante 1001 para la cédula 2001 — error **del suite, no del código** (la API aplicó bien la regla de rol "solo puedes matricular tu propia cédula", vigente desde antes de esta parte). Corregido el suite a sesión de admin, pasó.

## Verificación en el portal (navegador)

- **Estudiante (1001) — Matricular:** con el carrito en 8 créditos (B01 + B05, el botón se habilita solo entre 6 y 19), el envío muestra el mensaje del servidor en la interfaz: *"Requisitos previos sin aprobar: 'Cálculo 2' requiere 'Cálculo 1' aprobada (definitiva >= 3.0)"* y **no se guarda ninguna materia** (la BD quedó con las 4 matrículas originales de 1001, 0 filas de B01/B05). En consola no hay errores de JavaScript; la única entrada es el registro del 422 de la petición deliberadamente rechazada.
- El resto del portal no cambia en esta parte (la vista usa los mismos campos de `materias-disponibles`).

## Notas de reproducibilidad

- Aplicar `backend/migrations/V8__requisitos.sql` después de V1–V7 (idempotente) y correr `backend/scripts/cargar_requisitos_referencia.py` con el `python` del venv (lee `backend/.env`); puede repetirse sin duplicar filas.
- La validación exige requisito **aprobado**: una matrícula Activa del requisito sin definitiva no lo cumple (A3).
- El periodo '2026-2' del portal está fijo en `frontend/app.js` (línea 462), como venía funcionando; no se tocó en esta parte.
- La prueba de la ruta calculada usa un profesor temporal en B01 asignado y revertido por el propio suite; el estado de `materias` no cambia al terminar.
