# Indice de pruebas documentadas

Cada `docs/pruebas_*.md` es una matriz ejecutada contra la API en `http://localhost:8000` (credenciales enviadas por `X-Usuario`/`X-Clave`, nunca publicadas). Este indice resume que cubre cada una y el resultado documentado dentro del archivo.

| Archivo | Que cubre | Resultado documentado |
|---|---|---|
| `pruebas_roles.md` | Roles y reglas de negocio base del CRUD y las notas por rol (estudiante, profesor, admin). | **13/13 pasaron**, resultado global al final del archivo. |
| `pruebas_candado_matricula.md` | Candado de requisitos y matricula unica por periodo en el lote (parte 8): 409 con matricula activa, lote nuevo 201 con radicado, bloqueo por requisito. | **8/8** en el backend. Nota: sus periodos de prueba quedaron "en curso" y hoy chocan primero con la ventana de `fecha_inicio` (ver `pruebas_ventana_matricula.md`, que reordena y revalida estas reglas). |
| `pruebas_requisitos.md` | Requisitos previos (V8) en `POST /matriculas/lote` (parte 2): 422 si falta aprobar el requisito, radicado y transaccion unica. | **22/22**. |
| `pruebas_plan.md` | Plan de estudios por programa (V7) en `materias-disponibles` (parte 1): semestre, obligatoria, estado por materia. | **12 de 13 al cierre de esa parte**; la que fallaba era T3 (rechazo de fuera del plan en el lote), cerrada despues por `pruebas_plan_lote.md`. |
| `pruebas_plan_lote.md` | Validacion de plan en `POST /matriculas/lote` (parte 3): materias fuera del plan -> 422 antes de insertar. | **10/10**. |
| `pruebas_radicado.md` | Cabecera de matricula y radicado (parte 5): radicado unico de 8 caracteres, recibo con radicado, id_lote en las filas. | **10/10**. |
| `pruebas_cupos.md` | Bloqueo de cupos y creditos con **concurrencia** (parte 4): carreras de requests simultaneos, 409 sin cupo, 422 fuera de 6-19. | **14/14** con las carreras documentadas. |
| `pruebas_plan_admin.md` | Edicion del plan (parte 6A): GET/POST/PUT/DELETE `/programas/{id}/plan`, 403 a estudiante y profesor, 409 al quitar una materia de la que depende otra. | **16/16**. |
| `pruebas_tareas.md` | Tareas y entregas: creacion con tipo/momento, subida con archivo, calificaciones, quiz/examen directo, permisos por rol. | **29/29** (2 de arranque + 8 obligatorias con variantes + 15 adicionales). |
| `pruebas_notas_momento.md` | Notas por momento (V6): calculo de N1/N2/N3 desde tareas calificadas, sugerencias al profesor, estado Pendiente sin calificaciones. | Matriz con resultados reales de la corrida final, casos PASA/NO PASA documentados dentro del archivo. |
| `pruebas_requisitos_tablero.md` | Requisitos faltantes en `materias-disponibles` (tablero): `bloqueada`, `requisitos_faltantes` y desbloqueo al aprobar, con datos temporales limpiados. | **7/7** del endpoint y matriz del tablero. |
| `pruebas_ventana_matricula.md` | Ventana de matricula, **edicion con PUT `/matriculas/{id}`** e **historial `GET /estudiantes/{cedula}/matriculas`**: 201 antes de `fecha_inicio`, 409 en curso con mensaje exacto, 422 terminado; reemplazo de materias y borrado de notas; promedios y estados. | **14/14** (lote), **24/24** (PUT) y **11/11** (historial). |

## Estado de los datos usados

Todas las suites crearon estudiantes/periodos/materias temporales y los limpiaron al terminar; las credenciales de prueba nunca se publican en los archivos. Las matrices reflejan el comportamiento del codigo en la rama indicada al inicio de cada documento; las reglas de ventana posteriores (`pruebas_ventana_matricula.md`) prevalecen sobre ordenes de validacion mas antiguos (`pruebas_candado_matricula.md`).
