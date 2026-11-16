# Pruebas de tareas y entregas

Matriz ejecutada contra la API en `http://localhost:8000` (código de `feature/tareas`), con cuentas de la BD local de demo. Las credenciales se enviaron por los encabezados `X-Usuario` / `X-Clave` y **no se publican en este documento**: en un entorno real cada usuario solo conoce su propia clave.

Fecha de ejecución: 2026-11-13 · Periodo vigente usado: **2026-2** (2026-11-01 → 2026-12-20).

## Qué se probó

- **Backend:** migración `V4__tareas.sql` (tablas `tareas` y `entregas`), módulo `app/almacenamiento.py` y los 6 endpoints de `app/routers/tareas.py`.
- **Frontend:** sección "Tareas" del profesor, "Mis tareas" del estudiante y tarjeta de tareas en el Resumen del admin, con subida y descarga reales desde el navegador.
- **Regla de archivos:** solo `application/pdf`, `video/mp4` y `video/webm` (validados por tipo **y** extensión), máximo 20 MB medidos leyendo el archivo en el servidor; el nombre guardado siempre es `uuid4` + extensión, nunca el del cliente.

**Definición de "matriculado":** matrícula `Activa` cuyo periodo existe en la tabla `periodos` y está vigente (`CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin`). Las 2 matrículas demo con periodo inválido `2026-02` no cuentan, igual que en el resto del panel.

## Matriz de pruebas obligatorias

| # | Prueba | Rol / usuario | Resultado | Estado |
|---|--------|---------------|-----------|--------|
| PR01 | `POST /tareas/` en M01 con PDF de apoyo | Profesor (dueño de la materia) | **201**, `id_tarea=36091f30`, `tiene_apoyo=true`, `creada_por=PR01` | ✅ PASÓ |
| PR02 | `POST /tareas/` en M02 (materia de otro profesor) | Profesor de M01 | **403** `La materia 'M02' no es tuya; solo puedes crear tareas en tus materias` | ✅ PASÓ |
| PR03 | `POST /tareas/{id}/entregas` con PDF y comentario; luego `GET /tareas/` | Estudiante matriculado (1001) | **201** con `id_entrega=6d8d5837` y `subida_en`; el estado pasa a **"Entregado"** con `fecha_entrega=2026-11-13T22:22:43` | ✅ PASÓ |
| PR04 | Entrega en tarea de M02 sin estar matriculado | Estudiante 1001 | **403** `No estás matriculado en la materia 'M02'; no puedes entregar esta tarea` | ✅ PASÓ |
| PR05 | Entrega de tarea con plazo vencido (límite 2026-11-01) | Estudiante matriculado | **422** `La fecha límite de esta tarea fue 2026-11-01 00:00:00 y ya pasó; no se aceptan entregas fuera de plazo` | ✅ PASÓ |
| PR06 | Tarea vencida sin entregas en `GET /tareas/` | Estudiante matriculado | `estado_entrega = **"No entregó"**`; adicional: tarea futura sin entrega → `"Pendiente"` | ✅ PASÓ |
| PR07 | Entrega con `virus.exe` (y variante: `.exe` como apoyo del profesor) | Estudiante / Profesor | **422** tipo de archivo no permitido (solo PDF, MP4 o WebM), en ambos casos | ✅ PASÓ |
| PR08 | Entrega con PDF de 21 MB (y variante: apoyo de 21 MB) | Estudiante / Profesor | **422** `El archivo supera el máximo de 20 MB (medidos en el servidor: 21.0 MB)`, en ambos casos | ✅ PASÓ |

Pruebas adicionales ejecutadas (mismo suite):

| # | Prueba | Resultado | Estado |
|---|--------|-----------|--------|
| E1 | `GET /tareas/` del profesor dueño | **200** con `entregas_recibidas=1` y `matriculados=1` → el panel muestra "1 de 1 entregaron" | ✅ PASÓ |
| E2 | `GET /tareas/` del admin | **200** con las 4 tareas de todos los profesores | ✅ PASÓ |
| E3 | `GET /tareas/{id}/entregas` del profesor dueño | **200**: entregas con nombre (`1001 · Santiago Patiño Ríos`), comentario y fecha; `no_entregaron=[]` | ✅ PASÓ |
| E4 | `GET /tareas/{id}/entregas` del estudiante | **403** (las entregas de una tarea solo las ve el profesor de la materia) | ✅ PASÓ |
| E5a | `GET /tareas/{id}/apoyo` del profesor dueño | **200**, `application/pdf`, contenido real (empieza con `%PDF-`) | ✅ PASÓ |
| E5b | `GET /tareas/{id}/apoyo` del estudiante matriculado | **200**, PDF real | ✅ PASÓ |
| E5c | `GET /tareas/{id}/apoyo` del admin | **403** (el apoyo solo se comparte con el profesor dueño y estudiantes matriculados) | ✅ PASÓ |
| E6a | Archivo de una entrega → profesor dueño | **200**, PDF real | ✅ PASÓ |
| E6b | Archivo de una entrega → el autor (1001) | **200**, PDF real | ✅ PASÓ |
| E6c | Archivo de una entrega → admin | **200**, PDF real | ✅ PASÓ |
| E6d | Archivo de una entrega → otro profesor (PR02) | **403** | ✅ PASÓ |
| E7 | `GET /tareas/{id}/apoyo` de tarea sin apoyo | **404** `Esta tarea no tiene archivo de apoyo` | ✅ PASÓ |
| E8 | Archivo de una entrega inexistente | **404** | ✅ PASÓ |

**Resultado global: 29 de 29 pruebas pasaron** (2 de arranque + 8 obligatorias con sus 4 variantes + 15 adicionales). Ninguna fila falló; las dos corridas previas revelaron 3 defectos que fueron corregidos antes de la corrida final (ver "Defectos encontrados").

## Verificación de la interfaz (navegador)

Sobre el portal en `http://localhost:5173`, con sesión real de cada rol:

- **Profesor:** menú "Tareas" visible; el formulario lista solo sus materias (M01, M04); la lista muestra "X de Y entregaron"; el detalle en línea de cada tarea muestra la tabla de entregas con nombre, comentario, fecha y botón de descarga, más la lista "No han entregado" (o "Todos entregaron"). Se creó una tarea real desde la UI (`830565a5` en M04) y quedó verificada por la API.
- **Estudiante:** nueva sección "Mis tareas"; franja `Tareas=3 · Entregadas=1 · Pendientes=1 · No entregó=1`; el botón "Subir entrega" solo aparece con plazo vigente; la validación en el navegador rechaza `.exe`, archivos de más de 20 MB y envíos sin archivo, y acepta PDF/MP4/WebM. Subida real desde la UI: "Proyecto final" pasó de "Pendiente" a "Entregado · 13 de nov de 2026, 10:30 p. m."; "Descargar apoyo" descargó el PDF del profesor.
- **Admin:** en Resumen aparece la tarjeta "Tareas" con el total y las entregas recibidas; sin formularios de tareas.
- Consola del navegador durante toda la sesión: **0 errores y 0 avisos**.

## Defectos encontrados y corregidos

1. La consulta del archivo de una entrega usaba `t.id_profesor`, columna que no existe (la tarea usa `creada_por`): devolvía **500**. Corregido y vuelto a probar (E6a–E6d).
2. La primera versión de `listar_tareas` componía SQL con f-strings; se reescribió con consultas completas por rama y solo parámetros `%s`.
3. El formulario del profesor validaba el archivo de apoyo aunque fuera opcional y bloqueaba el envío sin archivo; corregido: solo se valida si se eligió uno.

## Notas de reproducibilidad

- Aplicar `backend/migrations/V4__tareas.sql` **después** de V1, V2 y V3 con pgAdmin → Query Tool, en orden.
- La cuenta del segundo profesor (PR02) no existía en la BD demo y se creó para poder ejecutar PR02/PR04 (rol Profesor, `id_persona=PR02`, misma política de claves del proyecto; la clave no se publica).
- Las tareas y entregas de la corrida final quedaron en la BD demo para poder navegar el portal; los archivos subidos viven en `backend/archivos/`, que está excluido del repositorio en `.gitignore`.

---

# Pruebas de calificación (ronda 2: tipos de actividad y calificaciones)

Extensión sobre `feature/calificacion` (base: `main` con la ronda 1 fusionada). Cambios cubiertos:

- **Migración `backend/migrations/V5__tipo_tarea.sql`** (nueva; no toca V1–V4): `tareas.tipo VARCHAR(20) NOT NULL DEFAULT 'taller'` con CHECK `taller/quiz/examen/trabajo`, y `entregas.calificacion NUMERIC(3,2)` nullable con CHECK entre 0.0 y 5.0. Las tareas previas quedan como `taller`.
- **`PUT /tareas/{id_tarea}/entregas/{id_entrega}/calificacion`**: solo el profesor dueño (403 en otro caso); 422 si la nota queda fuera de 0.0–5.0.
- **`POST /tareas/{id_tarea}/calificaciones`**: calificación directa con `cedula` + `calificacion`, solo para tareas de tipo `examen` o `quiz` (crea la entrega con `archivo=''` y la nota; si ya había entrega, actualiza su calificación).
- **`GET /tareas/{id_tarea}/entregas`** ahora incluye `calificacion` y `con_archivo` por entrega, y la lista `sin_calificacion`.
- **`GET /notas/`** del estudiante incluye `actividades` por materia (título, tipo, calificación, `subida_en`).
- **Frontend**: selector de tipo (examen/quiz ocultan el archivo de apoyo y muestran "Esta actividad se califica directamente"), calificación editable en el detalle del profesor, calificación directa en la lista de no entregados (examen/quiz), chip de tipo y de nota en Mis tareas, tarjeta "Mis tareas" en el Resumen del estudiante y actividades separadas por tipo en Mis notas.

## Pruebas obligatorias (resultados reales de la corrida final)

Suite contra `http://localhost:8000` con las cabeceras `X-Usuario`/`X-Clave` (credenciales demo del proyecto; las claves no se publican en el repositorio).

| # | Prueba | Petición | Resultado real | Estado |
|---|--------|----------|----------------|--------|
| C1a | Profesor califica una entrega de taller con 4.5 | `PUT /tareas/{taller}/entregas/{id}/calificacion` (profesor dueño) | **200** con `calificacion=4.5` | ✅ PASÓ |
| C1b | El estudiante ve la calificación del taller en Mis notas | `GET /notas/` (1001) | **200**; en `actividades` aparece `{titulo: "Taller 1 - Programación en Java", tipo: "taller", calificacion: 4.5}` | ✅ PASÓ |
| C2 | Profesor califica fuera de rango (6.0) | mismo PUT con `{"calificacion": 6.0}` | **422** `La calificación 6.0 está fuera del rango permitido (0.0 a 5.0)` | ✅ PASÓ |
| C3a | Profesor de otra materia intenta calificar | mismo PUT con el profesor de M02 | **403** `Solo el profesor de la materia puede calificar las entregas de esta tarea` | ✅ PASÓ |
| C3b/c | Variante admin y estudiante | mismo PUT con admin y con 1001 | **403** en ambos (la regla literal es "solo el profesor dueño") | ✅ PASÓ |
| C4 | Profesor crea un examen sin archivo | `POST /tareas/` con `tipo=examen` y sin archivo | **201**, `tipo=examen`, `tiene_apoyo=false` | ✅ PASÓ |
| C5a | Calificación directa del examen (4.8) | `POST /tareas/{examen}/calificaciones` `{"cedula":"1001","calificacion":4.8}` | **201** con `calificacion=4.8` y `con_archivo=false` | ✅ PASÓ |
| C5b | El estudiante ve el taller y el examen por separado en Mis notas | `GET /notas/` (1001) | **200**; tipos vistos: `taller` y `examen` (cada actividad con su título y nota) | ✅ PASÓ |
| C6 | Resumen del estudiante: tareas pendientes | `GET /tareas/` (1001) | **200**; hay tareas en estado "Pendiente" y fecha límite más cercana identificable (la UI muestra "N pendientes · Próxima fecha límite: …", o "Estás al día" si no hay) | ✅ PASÓ |

Pruebas adicionales de la misma corrida (mismo suite):

| # | Prueba | Resultado | Estado |
|---|--------|-----------|--------|
| E9 | Calificación directa en tarea `taller` | **422** (solo aplica a examen/quiz) | ✅ PASÓ |
| E10a/b | Entrega sin archivo en taller → **422**; en quiz → **201** con `con_archivo=false` | ambas pasaron | ✅ PASÓ |
| E11 | Calificar entrega inexistente | **404** | ✅ PASÓ |
| E12 | Estudiante intenta calificación directa | **403** | ✅ PASÓ |
| E13a/b | Calificación directa a no matriculado → **422**; a cédula inexistente → **404** | ambas pasaron | ✅ PASÓ |
| E14 | Calificación negativa (-1.0) | **422** | ✅ PASÓ |
| E15 | `GET /tareas/{examen}/entregas` | **200** con `calificacion=4.8`, `con_archivo=false`, `sin_calificacion=[]` y `no_entregaron=[]` correctos | ✅ PASÓ |
| E16 | Descargar archivo de una entrega calificada directamente | **404** `Esta entrega no tiene archivo (la actividad se calificó directamente)` | ✅ PASÓ |
| E17–E24 | Regresión de la ronda 1 (contadores "X de Y entregaron", admin ve todo, 403 de entregas al estudiante, PDFs reales, 404 claros) | todas pasaron | ✅ PASÓ |
| PR01b | Crear tarea con tipo inválido (`exposicion`) | **422** `El tipo 'exposicion' no es válido; usa uno de: taller, quiz, examen, trabajo` | ✅ PASÓ |

**Resultado global: 45 de 45 pruebas pasaron** (2 de arranque + 8 obligatorias de la ronda 1 + 9 de calificación C1–C6 + 26 adicionales y de regresión). Ninguna fila falló en la corrida final.

Nota de datos: en la respuesta de `GET /notas/` la lista `actividades` se repite en cada fila de nota de la misma materia (el estudiante demo tiene dos matrículas de M01 en el histórico); el frontend la **deduplica por materia** al renderizar, por lo que Mis notas muestra una tarjeta por actividad.

## Verificación de la interfaz (navegador, ronda 2)

Sobre el portal en `http://localhost:5173`, con sesión real de cada rol:

- **Profesor:** el formulario "Nueva tarea" muestra el selector de tipo (Taller/Quiz/Examen/Trabajo); al elegir **Examen** o **Quiz** el campo de archivo se oculta, se limpia y aparece el aviso "Esta actividad se califica directamente" (Taller/Trabajo lo vuelven a mostrar). En el detalle de entregas: tabla con columna "Calificación (0.0 a 5.0)" editable — se cambió 4.5 → 4.6 y "Guardar" devolvió el aviso "Calificación guardada: 4.6 para 1001." con la fila actualizada; encabezado con chip "N sin calificación". En "No han entregado" de un quiz: campo de nota + botón "Calificar" — se registró 3.5 y el estudiante pasó a la tabla de entregas como "Sin archivo · calificada directamente". Se creó un examen real desde la UI (`631a066e`, sin archivo) con su chip "Examen".
- **Estudiante:** Mis tareas muestra el **chip de tipo** en cada tarjeta (Taller/Quiz/Examen/Trabajo) y el **chip de nota** cuando existe (`Nota: 4.6`, `Nota: 4.8`, `Nota: 3.5`). El formulario de entrega de un examen indica "Tu archivo (opcional)" con el aviso "Esta actividad se califica directamente", mientras que en un trabajo el archivo sigue obligatorio. El **Resumen** muestra la tarjeta "Mis tareas" con "2 pendientes · Próxima fecha límite: 10 de dic de 2026" (con animación de llegada; texto "Estás al día ✓" cuando no hay pendientes). Mis notas muestra la sección "Calificaciones por actividad" con **taller, examen y quiz por separado**, cada uno con su tipo y nota, deduplicados por materia.
- **Admin:** Resumen intacto con la tarjeta "Tareas" (total + entregas recibidas); sin cambios de lógica de roles.
- **Tema oscuro:** los chips de tipo, de nota, el campo de calificación y las tarjetas de actividad toman la paleta oscura al alternar el botón flotante.
- Consola del navegador durante toda la sesión de los tres roles: **0 errores**.

## Notas de reproducibilidad (ronda 2)

- Aplicar `backend/migrations/V5__tipo_tarea.sql` **después** de V1–V4 (pgAdmin → Query Tool). Es idempotente: usa `IF NOT EXISTS` y recrea los CHECK con `DROP CONSTRAINT IF EXISTS`.
- En la BD demo usada para estas pruebas V5 ya estaba aplicada (columnas y CHECK verificados en `information_schema` y `pg_constraint`).
- Las tareas y entregas de la corrida final quedaron en la BD demo para poder navegar el portal (taller 4.6, examen 4.8, quiz 3.5, examen pendiente). La tarea `e2833058` creada manualmente por el usuario se conservó durante la limpieza de datos de prueba.
- La política de claves se mantiene: las credenciales reales no se publican en el repositorio.
