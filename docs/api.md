# Contrato de la API — Matricula Universitaria

Base: `http://localhost:8000` · Documentacion interactiva: `http://localhost:8000/docs`

Cobertura: todos los endpoints implementados en `backend/app/routers/` a la fecha de este documento. Si un endpoint no esta aqui, es porque no existe en el codigo.

## Autenticacion

Salvo `GET /`, `GET /health`, `POST /auth/login`, `POST /auth/cambiar-clave` y los `GET` de catalogos (`/facultades/`, `/programas/`, `/materias/`, `/profesores/`, `/estudiantes/`, `/periodos/`) y `GET /estudiantes/{cedula}/materias-disponibles`, toda petic exige los encabezados:

| Encabezado | Contenido |
|---|---|
| `X-Usuario` | usuario de la tabla `usuarios` |
| `X-Clave` | clave en texto plano (solo HTTP local; ver `docs/limitaciones.md`) |

Roles posibles: `Administrador`, `Profesor`, `Estudiante` (`seguridad_api.py`).

Errores comunes:

- `401` faltan encabezados o credenciales incorrectas: `{"detail": "Usuario o contrasena incorrectos"}`.
- `403` credenciales validas pero rol insuficiente.
- `404` el recurso referenciado no existe.
- `409` conflicto de estado (duplicado, cupos, ventana de matricula en curso).
- `422` validacion de datos o regla de negocio rechazada.

---

## Raiz

### `GET /health`
- **Rol:** publico. **Salida:** `{"estado": "ok"}`.

### `GET /`
- **Rol:** publico. **Salida:** `{"mensaje": "API de Matricula Universitaria en funcionamiento"}`.

---

## Auth — `routers/auth.py`

### `POST /auth/login`
- **Rol:** publico. **Entrada:** `{"usuario": "admin", "clave": "..."}`.
- **Salida 200:** `{"usuario", "rol", "id_persona", "debe_cambiar_clave"}` (sin sal ni hash). Para el estudiante, `id_persona` es su cedula; para el admin es `null`.
- **Errores:** `401` credenciales; `422` campos vacios.

### `POST /auth/cambiar-clave`
- **Rol:** cualquier usuario (verifica sus propias credenciales).
- **Entrada:** `{"usuario", "clave_actual", "clave_nueva"}`.
- **Salida 200:** `{"mensaje": "Contrasena actualizada"}`.
- **Errores:** `401` clave actual incorrecta; `422` clave nueva menor a 8 caracteres o igual a la actual.

### `POST /auth/restablecer-clave`
- **Rol:** `Administrador` (credenciales del admin en el cuerpo).
- **Entrada:** `{"usuario_admin", "clave_admin", "usuario_objetivo"}`.
- **Salida 200:** `{"usuario", "clave_temporal"}` (unica vez que se devuelve; `debe_cambiar_clave=true`).
- **Errores:** `403` el que firma no es admin; `401` clave del admin incorrecta; `404` usuario objetivo inexistente.

### `POST /auth/crear-cuenta-estudiante`
- **Rol:** solo `Administrador` (`X-Usuario`/`X-Clave` de admin). **Entrada:** `{"id_estudiante": "1002"}`.
- **Salida 201:** `{"usuario", "rol": "Estudiante", "clave_temporal"}`.
- **Errores:** `403` no admin; `404` el estudiante no existe; `409` la cuenta ya existe.

### `POST /auth/crear-cuenta-profesor`
- Igual al anterior con `{"id_profesor": "PR04"}` y `rol: "Profesor"`. Mismos errores.

---

## Facultades — `routers/facultades.py`

### `GET /facultades/`
- **Rol:** publico. **Salida 200:** `[{"id_facultad", "nombre_facultad"}]` ordenadas por ID.

### `POST /facultades/`
- **Rol:** solo `Administrador`. **Entrada:** `{"id_facultad", "nombre_facultad"}`.
- **Salida 201:** la facultad creada. **Errores:** `403`; `409` ID duplicado; `422`.

---

## Programas — `routers/programas.py`

### `GET /programas/`
- **Rol:** publico. **Salida 200:** `[{"id_programa", "nombre_programa", "id_facultad"}]`.

### `POST /programas/`
- **Rol:** solo `Administrador`. **Entrada:** `{"id_programa", "nombre_programa", "id_facultad"}`.
- **Salida 201:** el programa creado. **Errores:** `403`; `404` facultad inexistente; `409` duplicado; `422`.

---

## Plan de estudios — `routers/plan.py` (prefijo `/programas`)

Todos exigen `Administrador`.

### `GET /programas/{id_programa}/plan`
- **Salida 200:** `[{id_programa, nombre_programa, id_materia, nombre_curso, creditos, semestre, obligatoria}]` ordenado por semestre.
- **Errores:** `404` programa inexistente.

### `POST /programas/{id_programa}/plan`
- **Entrada:** `{"id_materia", "semestre" (1 a 10), "obligatoria" (bool)}`.
- **Salida 201:** la fila del plan con nombre y creditos de la materia.
- **Errores:** `404` programa o materia inexistente; `409` la materia ya esta en el plan.

### `PUT /programas/{id_programa}/plan/{id_materia}`
- **Entrada:** `{"semestre" (opcional), "obligatoria" (opcional)}` (al menos uno).
- **Salida 200:** la fila actualizada. **Errores:** `404` programa inexistente o materia fuera del plan; `422` semestre fuera de 1-10.

### `DELETE /programas/{id_programa}/plan/{id_materia}`
- Quita la materia del plan. No toca matriculas, notas ni tareas ya guardadas.
- **Salida 200:** mensaje de confirmacion.
- **Errores:** `404` programa inexistente o materia fuera del plan; `409` otra materia del MISMO plan depende de ella como requisito previo (el mensaje la nombra).

---

## Materias — `routers/materias.py`

### `GET /materias/`
- **Rol:** publico. **Salida 200:** `[{id_materia, nombre_curso, creditos, cupos, id_facultad, horario, id_profesor, dia, hora_inicio, hora_fin}]` (`dia`/`hora_*` son `null` si no se han cargado, migracion V10).

### `POST /materias/` — solo `Administrador`
- **Entrada:** `{"id_materia", "nombre_curso", "creditos" (>0), "cupos" (>=0, por defecto 20), "id_facultad", "id_profesor", "horario" (opcional), "dia" (opcional), "hora_inicio" (opcional), "hora_fin" (opcional)}`.
- **Salida 201:** la materia creada. **Errores:** `403`; `404` facultad o profesor inexistente; `409` ID duplicado; `422`.

### `PUT /materias/{id_materia}` — solo `Administrador`
- Misma entrada que el POST (reemplaza todos los campos). **Salida 200:** la materia actualizada.
- **Errores:** `404` materia, facultad o profesor inexistente; `422`.

### `DELETE /materias/{id_materia}` — solo `Administrador`
- **Salida 200:** `{"detalle": "La materia '...' (ID) se elimino correctamente."}`.
- **Errores:** `404` inexistente; `409` esta referenciada por plan, matriculas u otros registros.

---

## Profesores — `routers/profesores.py`

### `GET /profesores/`
- **Rol:** publico. **Salida 200:** `[{"id_profesor", "nombre", "apellidos"}]`.

### `POST /profesores/`
- **Rol:** solo `Administrador`. **Entrada:** `{"id_profesor", "nombre", "apellidos"}`.
- **Salida 201:** el profesor creado. **Errores:** `403`; `409` duplicado; `422`.

---

## Estudiantes — `routers/estudiantes.py`

### `GET /estudiantes/`
- **Rol:** publico. **Salida 200:** `[{id_estudiante, nombre, apellidos, correo, telefono, semestre, id_programa}]`.

### `POST /estudiantes/`
- **Rol:** solo `Administrador`. **Entrada:** `{"id_estudiante", "nombre", "apellidos", "correo" (con @), "telefono" (opcional), "semestre" (>0), "id_programa"}`.
- **Salida 201:** el estudiante creado. **Errores:** `403`; `404` programa inexistente; `409` duplicado; `422`.

### `GET /estudiantes/{cedula}/materias-disponibles`
- **Rol:** publico.
- **Que devuelve:** las materias del **plan de estudios del programa del estudiante** (V7), no toda la facultad, con el semestre del plan y el estado academico de cada una: `Aprobada` (definitiva >= 3.0), `Matriculada` (tiene matricula activa en el periodo vigente), `bloqueada: true` mas `requisitos_faltantes: [{id_materia, nombre_curso}]` si le faltan requisitos (V8), o `Disponible`.
- **Salida 200:** `[{id_estudiante, id_programa, id_facultad, id_materia, nombre_curso, creditos, cupos, horario, id_profesor, dia, hora_inicio, hora_fin, semestre, obligatoria, estado, bloqueada, requisitos_faltantes}]`.
- **Errores:** `422` cedula vacia; `404` estudiante inexistente.

### `GET /estudiantes/{cedula}/matriculas?periodo=...`
- **Rol:** el propio estudiante o `Administrador` (el profesor recibe `403`).
- **Que devuelve:** historial del periodo: materias con `id_matricula`, `nombre_curso`, `creditos`, `calificacion` y `nota_final` (la definitiva registrada a mano o la calculada desde tareas), `estado` (`Cursando` si el periodo esta abierto; si no `Aprobada` >= 3.0, `Reprobada` < 3.0 o `Sin nota`) y los promedios ponderados por creditos del semestre y del acumulado.
- **Salida 200:** `{"cedula", "periodo", "periodo_abierto", "materias": [...], "promedio_semestre", "promedio_acumulado"}`.
- **Errores:** `422` cedula/periodo vacio o periodo inexistente en `periodos`; `404` estudiante inexistente; `403` rol insuficiente.

---

## Matriculas — `routers/matriculas.py` (requieren sesion)

### `GET /matriculas/`
- **Visibilidad:** estudiante solo las suyas; profesor solo las de sus materias; admin todas.
- **Salida 200:** `[{id_matricula, cedula, id_materia, creditos, periodo, fecha_matricula, estado}]`.

### `POST /matriculas/`
- **Rol:** todos (el estudiante solo con **su propia cedula**, si no `403`; el admin sin restriccion).
- **Entrada:** `{"cedula", "id_materia", "periodo"}`.
- **Reglas:** periodo vigente (hoy dentro de `[fecha_inicio, fecha_fin]`, si no `422`), cupos disponibles (`409` si no hay), no duplicada en el periodo (`409`), creditos del periodo <= 19 (`409`).
- **Salida 201:** la matricula creada. **Errores adicionales:** `404` estudiante/materia/periodo; `422`.

### `POST /matriculas/lote`
- **Rol:** todos (estudiante solo su cedula).
- **Entrada:** `{"cedula", "periodo", "id_materias": [...]}`.
- **Reglas (en orden):** periodo existe; ventana de fechas (`hoy < fecha_inicio` permite; `fecha_inicio <= hoy <= fecha_fin` devuelve `409` con `"El periodo 'X' ya empezo. Para cambios, usa adicion o cancelacion."`; `hoy > fecha_fin` devuelve `422`); estudiante sin matricula activa en el periodo (`409`) ni en curso en otro periodo (`409`); materias existentes, del plan del programa (`422`), sin repetidos (`409`), sin cupos (`409`), requisitos previos aprobados (`422`), total de creditos 6-19 (`422`) y sin cruce de horario (`422`). Todo se valida antes de insertar: si algo falla, no se guarda nada.
- **Salida 201:** `{"cedula", "periodo", "total_creditos", "radicado", "matriculas": [{id_matricula, id_materia, creditos}]}` — el radicado (8 caracteres, unico) queda en `matriculas_lote` (V9).

### `PUT /matriculas/{id_matricula}`
- **Rol:** el propio estudiante o admin (`403` si no).
- **Entrada:** `{"id_materias": [...]}` (reemplazo completo de las materias del estudiante en el periodo de esa matricula: agrega las que faltan y elimina junto con sus notas las que no esten) o `{"estado": "..."}` (cambia el estado de la fila referenciada).
- **Reglas:** misma ventana que DELETE (antes de `fecha_inicio`; en curso `409`; terminado `422`) y las mismas validaciones del lote (plan, cupos, requisitos, creditos 6-19, cruce).
- **Salida 200:** `{"id_matricula", "cedula", "id_materia", "creditos", "periodo", "fecha_matricula", "estado", "total_creditos", "materias": [{id_matricula, id_materia, creditos, estado}]}`.
- **Errores:** `404` matricula inexistente o materias inexistentes; `409` repetidas/cupos/ventana en curso; `422` ventana terminada/plan/requisitos/creditos/cruce.

### `DELETE /matriculas/{id_matricula}`
- **Rol:** el propio estudiante o admin.
- **Reglas:** misma ventana (antes de `fecha_inicio`; en curso `409`; despues de `fecha_fin` `422`). Borra primero las notas dependientes y luego la fila de matricula.
- **Salida 200:** `{"eliminado": "<id_matricula>", "periodo": "<periodo>"}`.
- **Errores:** `404` inexistente; `403` ajena; `409`/`422` por ventana.

---

## Notas — `routers/notas.py` (requieren sesion)

### `GET /notas/`
- **Visibilidad:** estudiante solo las suyas; profesor solo las de sus materias; admin todas.
- **Salida 200:** `[{id_nota, id_matricula, id_materia, nota1, nota2, nota3, definitiva, estado, calculada}]`.
- **Estudiante ademas:** `actividades: [{titulo, tipo, calificacion, subida_en}]` por materia (entrega mas reciente de cada tarea calificada) y filas con `calculada: true` para matriculas sin nota a mano, cuyas N1/N2/N3 se calculan desde las tareas con `momento` (`calculo_notas.py`).

### `POST /notas/`
- **Rol:** `Profesor` (solo matriculas de sus materias) o `Administrador`; estudiante `403`.
- **Entrada:** `{"id_matricula", "nota1", "nota2", "nota3"}` (0.0 a 5.0).
- **Salida 201:** la nota creada; el servidor calcula `definitiva = round((n1+n2+n3)/3, 2)` y `estado: "Aprobado"` si `>= 3.0`, si no `"Reprobado"`.
- **Errores:** `403`; `404` matricula inexistente; `409` ya tiene nota; `422` fuera de rango.

### `GET /notas/sugerencias/{id_materia}`
- **Rol:** el profesor de la materia o admin; estudiante `403`.
- **Que devuelve:** sugerencia de solo lectura: N1/N2/N3 y definitiva calculadas desde las tareas con `momento` de esa materia para cada estudiante matriculado. Un momento sin calificaciones llega `null`, no 0.
- **Salida 200:** `[{cedula, nombre, nota1, nota2, nota3, definitiva, estado}]`.
- **Errores:** `403` materia ajena o rol estudiante; `404` materia inexistente.

---

## Periodos — `routers/periodos.py`

### `GET /periodos/`
- **Rol:** publico. **Salida 200:** `[{periodo, fecha_inicio, fecha_fin}]` (fechas `YYYY-MM-DD`).

### `POST /periodos/`
- **Rol:** solo `Administrador`. **Entrada:** `{"periodo", "fecha_inicio", "fecha_fin"}`.
- **Salida 201:** el periodo creado. **Errores:** `403`; `409` duplicado; `422` formato invalido o inicio > fin.

---

## Tareas — `routers/tareas.py` (requieren sesion)

### `POST /tareas/`
- **Rol:** solo `Profesor` y solo en **sus** materias.
- **Entrada (multipart):** `id_materia`, `titulo` (max 120), `descripcion`, `fecha_limite`, `tipo` (taller/quiz/examen/trabajo), `momento` (1 a 3, opcional) y `archivo` de apoyo opcional (PDF, MP4 o WebM, max 20 MB).
- **Salida 201:** `{id_tarea, id_materia, titulo, descripcion, fecha_limite, tiene_apoyo, creada_por, creada_en, tipo, momento}`.
- **Errores:** `403` no profesor o materia ajena; `404` (materia inexistente se reporta como materia ajena); `422` campos/tipo/momento/tamano invalidos.

### `GET /tareas/?id_materia=...`
- **Rol:** sesion (admin ve todas; profesor solo las de sus materias; estudiante solo las de sus materias con matricula activa en periodo vigente). `id_materia` es opcional y filtra.
- **Salida 200:** `[{id_tarea, id_materia, materia, titulo, descripcion, fecha_limite, tiene_apoyo, creada_en, tipo, momento}]`. El estudiante recibe ademas `estado_entrega` (`Entregado`/`Pendiente`/`No entrego`), `fecha_entrega` y `calificacion`; profesor y admin reciben `entregas_recibidas` y `matriculados`.

### `POST /tareas/{id_tarea}/entregas`
- **Rol:** estudiante. **Entrada (multipart):** `archivo` (obligatorio salvo examen/quiz) y `comentario` opcional (max 300).
- **Salida 201:** confirmacion de la entrega. Cuenta la entrega mas reciente.
- **Errores:** `403`; `404` tarea inexistente; `422` archivo invalido o falta el obligatorio.

### `GET /tareas/{id_tarea}/entregas`
- **Rol:** profesor dueño de la materia o admin (estudiante `403`).
- **Salida 200:** `{"entregas": [{id_entrega, cedula, nombre, subida_en, comentario, con_archivo, calificacion}], "no_entregaron": [{cedula, nombre}], "sin_calificacion": [...]}`.
- **Errores:** `404` tarea inexistente; `403`.

### `PUT /tareas/{id_tarea}/entregas/{id_entrega}/calificacion`
- **Rol:** profesor dueño de la materia. **Entrada:** `{"calificacion": 4.5}` (0.0 a 5.0).
- **Salida 200:** la calificacion guardada. **Errores:** `403`; `404` tarea/entrega inexistente; `422` fuera de rango.

### `POST /tareas/{id_tarea}/calificaciones`
- **Rol:** profesor dueño. **Entrada:** `{"cedula", "calificacion"}`. Para examenes y quizzes sin archivo: crea o actualiza la entrega con la calificacion directa.
- **Salida 200/201:** confirmacion. **Errores:** `403`; `404`; `422`.

### `GET /tareas/{id_tarea}/apoyo`
- **Rol:** profesor dueño o estudiante matriculado en la materia. Devuelve el archivo de apoyo (PDF).
- **Errores:** `404` tarea o apoyo inexistente; `403`.

### `GET /tareas/{id_tarea}/entregas/{id_entrega}/archivo`
- **Rol:** profesor dueño, admin o el estudiante autor de la entrega. Devuelve el archivo entregado.
- **Errores:** `404` entrega inexistente; `403`.

---

## PDF — `routers/pdf.py` (requieren sesion)

### `GET /pdf/matricula/{cedula}?periodo=...`
- **Visibilidad:** estudiante solo su cedula; profesor solo cedulas matriculadas en sus materias; admin todas.
- **Salida 200:** PDF del recibo del periodo (si se omite `periodo`, el mas reciente con matriculas). Incluye radicado, periodo, fecha y total de creditos.
- **Errores:** `403`; `404` estudiante inexistente o sin matriculas; `422` cedula/periodo vacio.

### `GET /pdf/notas/{cedula}`
- Misma visibilidad. **Salida 200:** PDF del boletin de notas. **Errores:** identicos.

---

## Matriz resumen de roles

| Endpoint | Publico | Estudiante | Profesor | Admin |
|---|---|---|---|---|
| `GET /`, `GET /health` | si | si | si | si |
| `POST /auth/login`, `POST /auth/cambiar-clave` | si | si | si | si |
| `GET` de catalogos y `materias-disponibles` | si | si | si | si |
| `POST` de catalogos, `POST/PUT/DELETE /materias/{id}`, `/programas/{id}/plan/*`, `POST /periodos/`, `POST /auth/restablecer-clave`, crear cuentas | no | 403 | 403 | si |
| `GET /matriculas/`, `GET /notas/` | no | solo las suyas | solo sus materias | todas |
| `POST /matriculas/`, `POST /matriculas/lote` | no | solo su cedula | si | si |
| `PUT/DELETE /matriculas/{id}` | no | solo la propia | 403 | si |
| `GET /estudiantes/{cedula}/matriculas` | no | solo la propia | 403 | si |
| `POST /notas/`, `GET /notas/sugerencias/{id}` | no | 403 | solo sus materias | si |
| `POST /tareas/` | no | 403 | solo sus materias | 403 |
| `GET /tareas/` | no | sus materias activas | sus materias | todas |
| `POST /tareas/{id}/entregas` | no | si | 403 | 403 |
| `GET /tareas/{id}/entregas`, calificaciones | no | 403 | dueño de la materia | solo ver |
| `GET /pdf/*` | no | su cedula | sus estudiantes | todas |

## Como probar rapido (PowerShell)

```powershell
$h = @{ "X-Usuario" = "admin"; "X-Clave" = "SU_CLAVE" }
Invoke-RestMethod http://localhost:8000/health
Invoke-RestMethod -Headers $h http://localhost:8000/matriculas/
Invoke-RestMethod -Headers $h http://localhost:8000/estudiantes/1001/matriculas?periodo=2026-2
```
