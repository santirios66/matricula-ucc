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
