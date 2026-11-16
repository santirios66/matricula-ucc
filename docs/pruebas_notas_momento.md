# Pruebas de notas por momento (V6)

Matriz ejecutada contra la API en `http://localhost:8000` (rama `feature/notas-por-momento`, base `main` con la ronda de estadísticas/PDF ya fusionada), con cuentas de la BD local de demo. Las credenciales se enviaron por los encabezados `X-Usuario` / `X-Clave` y **no se publican en este documento**.

Fecha de ejecución: 2026-11-16 · Periodo vigente usado: **2026-2** (2026-11-01 → 2026-12-20).

## Qué se probó

- **Migración `backend/migrations/V6__momento_tarea.sql`** (nueva; no toca V1–V5): `tareas.momento SMALLINT` nullable con CHECK entre 1 y 3; las tareas existentes quedan con `momento NULL` (sin valor por defecto).
- **Crear tarea:** el campo `momento` es obligatorio (1, 2 o 3); 422 si falta o está fuera de rango.
- **Cálculo por momento** (módulo nuevo `app/calculo_notas.py`, compartido por `/notas/`, sugerencias y PDF): N1/N2/N3 son el promedio de las calificaciones de tareas de cada momento, usando la calificación **más reciente** de cada tarea (la misma regla del reporte de notas). Un momento sin calificaciones queda `NULL`, no 0. La definitiva es el promedio de los momentos con valor (si solo hay uno, ese valor). Estado: Aprobado con 3.0 o más, Reprobado si no, "Pendiente" si no hay ninguna.
- **Dónde se usa:** `GET /notas/` del estudiante agrega una fila calculada por cada matrícula sin notas registradas a mano (`calculada=true`); el PDF de notas usa el cálculo para esas mismas matrículas; **las notas a mano de la tabla `notas` tienen prioridad y no se recalculan**.
- **Sugerencias:** endpoint nuevo `GET /notas/sugerencias/{id_materia}` (solo lectura) para el profesor de la materia.
- **Frontend:** selector obligatorio de Momento en el formulario de nueva tarea, chip de momento en Mis tareas, sugerencias N1/N2/N3 bajo cada campo de nota en Ingresar notas (sin cambiar lo que el profesor escriba) y chip "Calculada" en Mis notas.

## Pruebas obligatorias (resultados reales de la corrida final)

Suite contra `http://localhost:8000`. Datos de la corrida: el estudiante 1001 tiene matrícula activa en M03 (`fa236783`, periodo 2026-2) y dos matrículas de M01 con notas registradas a mano (`3.00/4.00/2.70 → 3.23 Aprobado` y `4.00/3.50/4.50 → 4.00 Aprobado`).

| # | Prueba | Petición | Resultado real | Estado |
|---|--------|----------|----------------|--------|
| B1 | Crear tarea **sin momento** → 422 | `POST /tareas/` (multipart) sin `momento` | **422** `El momento es obligatorio; usa 1, 2 o 3` | ✅ PASÓ |
| B2 | Crear tarea con **momento 4** → 422 | `POST /tareas/` con `momento=4` | **422** `El momento 4 no es válido; usa 1, 2 o 3` | ✅ PASÓ |
| B3a | Profesor crea taller con momento 1 | `POST /tareas/` en M03 con `momento=1` | **201**, `momento=1` | ✅ PASÓ |
| B3b | Estudiante entrega y el profesor califica 4.0 | `POST /tareas/{id}/entregas` + `PUT .../calificacion` | entrega **201**, calificación **200** | ✅ PASÓ |
| B3c | Un taller momento 1 con 4.0 → **N1 = 4.00 y definitiva = 4.00** | `GET /notas/` (1001) | **200**; fila de M03: `{id_nota: null, id_matricula: fa236783, nota1: 4.0, nota2: null, nota3: null, definitiva: 4.0, estado: "Aprobado", calculada: true}` | ✅ PASÓ |
| B4a | Segundo taller momento 1 calificado 3.0 | `POST /tareas/` + entrega + calificación | **201 / 201 / 200** | ✅ PASÓ |
| B4b | Dos talleres momento 1 (4.0 y 3.0) → **N1 = 3.50** | `GET /notas/` (1001) | **200**; `nota1=3.5`, `definitiva=3.5`, estado `Aprobado` | ✅ PASÓ |
| B5a | Quiz de momento 2 creado **sin calificar** | `POST /tareas/` con `momento=2` | **201**, `momento=2` | ✅ PASÓ |
| B5b | Momento sin calificaciones → **N2 queda NULL, no 0** | `GET /notas/` (1001) | **200**; `nota2=null` y `definitiva` sigue `3.5` (promedio de los momentos con valor) | ✅ PASÓ |
| B6a | Taller momento 1 en M01 (materia con notas a mano) calificado 5.0 | `POST /tareas/` + entrega + calificación | **201 / 201 / 200** | ✅ PASÓ |
| B6b | **Notas a mano tienen prioridad** y no se recalculan | `GET /notas/` (1001) antes y después | Las 2 filas a mano de M01 quedan **idénticas** (3.00/4.00/2.70 → 3.23 y 4.00/3.50/4.50 → 4.00, `calculada=false`), no aparece ninguna fila calculada de M01, y el nuevo taller 5.0 no las afecta | ✅ PASÓ |
| B7a | PDF de notas del estudiante | `GET /pdf/notas/1001` (PR03) | **200**, 3680 bytes, empieza con `%PDF-` | ✅ PASÓ |
| B7b | **PDF muestra los N calculados y los a mano** | contenido del PDF | La tabla incluye M03 calculada (`3.50`, `Aprobado`) junto a las filas a mano de M01 (`3.23` y `4.00`) intactas | ✅ PASÓ |
| B7c | PDF indica la regla del cálculo | contenido del PDF | Aparece la nota explicativa: N por momento = promedio de las calificaciones de cada momento, definitiva = promedio de los momentos con calificación (si solo hay uno, ese valor) | ✅ PASÓ |

**Resultado global: 20 de 20 pruebas pasaron** (incluidas las 7 obligatorias del enunciado y sus pasos previos).

Pruebas adicionales de la misma corrida (mismo suite):

| # | Prueba | Resultado real | Estado |
|---|--------|----------------|--------|
| S0 | API disponible | `GET /health` → **200** | ✅ PASÓ |
| B8 | `GET /tareas/` del estudiante incluye el momento | **200**; 4 tareas nuevas con `momento` (1, 1, 2 y 3) y 8 anteriores con `momento=null` (sin chip en la UI) | ✅ PASÓ |
| B9a | Sugerencias para Ingresar notas | `GET /notas/sugerencias/M03` (PR03) → **200**; `1001 · Santiago Patiño Ríos` con `nota1=3.5`, `nota2=null`, `nota3=null`, `definitiva=3.5`, `Aprobado` | ✅ PASÓ |
| B9b | Profesor ajeno en sugerencias | `GET /notas/sugerencias/M03` (PR01) → **403** `La materia 'M03' no es tuya; solo puedes consultar tus materias` | ✅ PASÓ |
| B9c | Estudiante en sugerencias | `GET /notas/sugerencias/M03` (1001) → **403** | ✅ PASÓ |
| B10 | Regresión: crear tarea en materia ajena sigue 403 | `POST /tareas/` (PR01 en M02) con momento 1 → **403** | ✅ PASÓ |

Casos de esquina cubiertos por el diseño y verificados en la corrida: definitiva con un solo momento calificado = ese valor (B3c), estado "Pendiente" cuando no hay ninguna calificación (visible en M02 en la UI, ver abajo) y "más reciente por tarea" con `DISTINCT ON (matrícula, tarea) ORDER BY subida_en DESC`, la misma regla del reporte de notas.

## Verificación de la interfaz (navegador)

Sobre el portal en `http://localhost:5173`, con sesión real de cada rol:

- **Profesor (PR01):** el formulario "Nueva tarea" muestra el selector **Momento \*** (Momento 1/2/3, obligatorio). Se creó una tarea real desde la UI ("Taller momento 3 - Polimorfismo", M01, Momento 3) y quedó con chip **"Momento 3"** en la lista del profesor; las tareas anteriores sin momento no muestran chip.
- **Profesor (PR03) — Ingresar notas:** al elegir M03, la tabla de 1001 muestra bajo cada campo la sugerencia **"Sugerido: 3.50" / "Sugerido: —" / "Sugerido: —"** (promedio del momento 1 y momentos sin calificaciones). Es informativa: los campos siguen vacíos y no cambia lo que el profesor escriba.
- **Estudiante (1001) — Mis tareas:** 5 tareas nuevas con chip de momento (Momento 1, 1, 2, 3) y 8 anteriores sin chip.
- **Estudiante (1001) — Mis notas:** las filas a mano de M01 siguen intactas (3.23 y 4.00, con su ID); M02 aparece con ID "—", chip **"Calculada"** y estado **"Pendiente"** (sin calificaciones: N todos "—"); M03 aparece calculada con chip **"Calculada"**, `3.50 / — / — → 3.50 Aprobado`.
- **Tema oscuro:** los chips de momento, de "Calculada" y la sugerencia toman la paleta oscura al alternar el botón flotante.
- Consola del navegador durante toda la sesión de los tres roles: **0 errores**.

## Defectos encontrados y corregidos

1. **Datos de demo, no de producto:** la matrícula de 1001 en M03 no existía en la BD demo, por lo que las entregas en tareas de M03 devolvían 403 (`No estás matriculado`) y las primeras corridas del suite fallaban en B3/B4/B5/B7. Se creó la matrícula `fa236783` (1001 en M03, periodo `2026-2`, `Activa`, 3 créditos) y todas las pruebas pasaron. El comportamiento de la API fue correcto en todo momento: la regla "matrícula Activa con periodo vigente" ya existía.
2. **Del suite de pruebas (no del producto):** el primer envío de `POST /tareas/` mandaba JSON a un endpoint que espera `multipart/form-data` y devolvía un 422 genérico de Pydantic; el suite se corrigió para enviar siempre multipart. Igualmente, la aserción B6b esperaba valores fijos que no correspondían a las filas reales; se reescribió para comparar las filas a mano antes y después de la intervención.

## Notas de reproducibilidad

- Aplicar `backend/migrations/V6__momento_tarea.sql` **después** de V1–V5 (pgAdmin → Query Tool). Es idempotente: usa `IF NOT EXISTS` y recrea el CHECK con `DROP CONSTRAINT IF EXISTS`.
- En la BD demo usada para estas pruebas V6 ya estaba aplicada (columna `smallint` y CHECK `ck_tareas_momento` verificados; las 10 tareas previas quedaron con `momento NULL`).
- Las tareas de la corrida final quedaron en la BD demo para poder navegar el portal: "Taller momento 1 - Bases de Datos" (4.0), "Taller momento 1 - Consultas SQL" (3.0), "Quiz momento 2 - Normalizacion" (sin calificar), "Taller momento 1 - Java basico" (5.0) y "Taller momento 3 - Polimorfismo" (creada desde la UI, Momento 3).
- La política de claves se mantiene: las credenciales reales no se publican en el repositorio.
