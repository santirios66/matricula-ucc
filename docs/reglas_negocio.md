# Reglas de negocio — donde se validan

Cada regla con el archivo y la funcion del backend que la enforce. El frontend refleja estas reglas pero la fuente de verdad es siempre la API.

## Sesion y cuentas

| Regla | Donde se valida |
|---|---|
| Tres roles: Administrador, Profesor, Estudiante. | `backend/app/seguridad_api.py` (`ROL_ADMIN`, `ROL_PROFESOR`, `ROL_ESTUDIANTE`; `autenticar` y `require_admin` en cada endpoint). |
| Login por usuario y clave; nunca se devuelve sal ni hash. | `backend/app/routers/auth.py` → `login`. |
| Claves con hash PBKDF2-SHA256 y sal; clave temporal de 8 caracteres; cambio obligatorio al primer ingreso (`debe_cambiar_clave`). | `backend/app/seguridad.py` (`crear_hash`, `generar_clave_temporal`, `verificar_clave`) usado por `auth.py` (`cambiar_clave`, `restablecer_clave`, `_crear_cuenta`). |
| Clave nueva: minimo 8 caracteres y distinta de la actual. | `auth.py` → `cambiar_clave`. |
| Restablecer clave y crear cuentas: solo Administrador. | `auth.py` → `restablecer_clave`, `crear_cuenta_estudiante`, `crear_cuenta_profesor` (con `require_admin`). |

## Matricula

| Regla | Donde se valida |
|---|---|
| El estudiante solo puede matricular/modificar/eliminar **su propia cedula**. | `matriculas.py` → `crear_matricula`, `crear_matriculas_lote`, `actualizar_matricula`, `eliminar_matricula` (comparacion con `sesion["id_persona"]`). |
| Ventana de matricula: antes de `fecha_inicio` se permite; en curso (`fecha_inicio <= hoy <= fecha_fin`) rechaza con 409 y el mensaje "El periodo 'X' ya empezo..."; despues de `fecha_fin` rechaza con 422. Aplica a lote, PUT y DELETE. | `matriculas.py` → `_verificar_ventana_periodo` (usada por `crear_matriculas_lote`, `actualizar_matricula`, `eliminar_matricula`). El POST unitario exige periodo vigente. |
| Una sola matricula activa por estudiante en el periodo; ademas, con matricula en curso en otro periodo no puede volver a matricular por lote. | `matriculas.py` → `crear_matriculas_lote` (pasos de verificacion previos a insertar). |
| Total de creditos del carrito entre **6 y 19**. | `matriculas.py` → `crear_matriculas_lote` y `actualizar_matricula` (suma de `creditos` de las materias). |
| Solo materias del **plan de estudios del programa** del estudiante (V7). | `matriculas.py` → `crear_matriculas_lote` y `actualizar_matricula` (consulta `plan_estudios`, error "Materias fuera del plan de estudios"). |
| **Requisitos previos** (V8): toda materia del carrito exige sus requisitos con definitiva >= 3.0. | `matriculas.py` → `crear_matriculas_lote` y `actualizar_matricula` (validacion antes de insertar); consulta previa en `estudiantes.py` → `materias_disponibles` (`requisitos_faltantes`, `bloqueada`). |
| **Cupos**: no se puede superar `materias.cupos` en el periodo (COUNT de matriculados, sin descuento en la tabla). | `matriculas.py` → `crear_matricula`, `crear_matriculas_lote` y `actualizar_matricula`. |
| **Cruce de horario**: dos materias del carrito no pueden cruzarse (mismo dia y horas solapadas, V10). | `matriculas.py` → `crear_matriculas_lote` y `actualizar_matricula`; advertencia previa en `frontend/app.js` (`hayCruceHorario`). |
| No repetir la misma materia en el mismo periodo. | Restriccion `UNIQUE (cedula, id_materia, periodo)` de `migrations/V1__crear_tablas.sql`; 409 explicito en lote/PUT para repetidas dentro del carrito. |
| El lote crea una **cabecera con radicado unico** de 8 caracteres y es transaccional: si algo falla no se guarda nada. | `matriculas.py` → `crear_matriculas_lote` + `migrations/V9__matricula_cabecera.sql`. |
| PUT `/matriculas/{id}` con `id_materias` reemplaza el conjunto completo: agrega las que faltan y elimina (con sus notas) las que no esten. | `matriculas.py` → `actualizar_matricula`. |
| DELETE `/matriculas/{id}` borra primero las notas dependientes. | `matriculas.py` → `eliminar_matricula`. |

## Notas

| Regla | Donde se valida |
|---|---|
| Notas entre **0.0 y 5.0**; `definitiva = round((n1+n2+n3)/3, 2)`; **Aprobado** con definitiva >= 3.0. | `notas.py` → `crear_nota` (y CHECKs de `V1__crear_tablas.sql`). |
| Solo el profesor de la materia (o admin) registra notas; una matricula solo tiene una nota. | `notas.py` → `crear_nota`. |
| Notas **calculadas por momentos** para matriculas sin nota a mano: N1/N2/N3 desde tareas con `momento` calificadas; un momento sin calificaciones es `null`; estado "Pendiente" si no hay ninguna. | `backend/app/calculo_notas.py` (`calcular_notas_por_momento`) usado en `notas.py` → `listar_notas`; sugerencias para el profesor en `calculo_notas.py` (`sugerencias_por_materia`) expuestas en `GET /notas/sugerencias/{id_materia}` (solo lectura). |
| En el historial por periodo, el estado por materia es `Cursando` si el periodo esta abierto; si no `Aprobada` (>= 3.0), `Reprobada` (< 3.0) o `Sin nota`; promedios **ponderados por creditos**, ignorando materias sin nota. | `estudiantes.py` → `matriculas_por_periodo`. |

## Tareas y entregas

| Regla | Donde se valida |
|---|---|
| Solo el profesor crea tareas y solo en **sus** materias. | `tareas.py` → `crear_tarea`. |
| Tipos validos: taller, quiz, examen, trabajo; **momento** 1 a 3 (nullable). | `tareas.py` (`_tipo_valido`, `_momento_valido`) + CHECKs de `V5__tipo_tarea.sql` y `V6__momento_tarea.sql`. |
| Archivo de apoyo/entrega: PDF, MP4 o WebM, maximo 20 MB. | `backend/app/almacenamiento.py` → `validar_archivo`, `guardar_archivo` (usados por `tareas.py`). |
| En quiz y examen la entrega de archivo es opcional: se califica directamente. | `tareas.py` → `crear_calificacion_directa` (crea o actualiza la entrega con la calificacion). |
| De varias entregas de la misma tarea cuenta **la mas reciente**. | `tareas.py` → `listar_tareas` (ORDER BY subida_en DESC LIMIT 1) y calculo de actividades en `notas.py` (DISTINCT ON por tarea). |
| Las entregas las ve y califica solo el profesor dueño de la materia. | `tareas.py` → `listar_entregas`, `calificar_entrega`, `crear_calificacion_directa`. |
| El archivo de apoyo lo descargan el profesor dueño o estudiantes matriculados. | `tareas.py` → `descargar_apoyo`. |

## Catalogos

| Regla | Donde se valida |
|---|---|
| Jerarquia: facultad -> programa -> estudiante; materia con facultad y profesor. | Llaves foraneas de `V1__crear_tablas.sql`; 404 en `facultades.py`, `programas.py`, `materias.py`, `estudiantes.py`. |
| Crear/editar catalogos: solo Administrador. | `require_admin` en todos los POST/PUT/DELETE de catalogos, plan y periodos. |
| Semestre del plan entre 1 y 10; obligatoria/electiva. | `plan.py` (modelos con `ge=1, le=10`) + CHECK de `V7__plan_estudios.sql`. |
| No se puede quitar del plan una materia de la que depende otra del MISMO plan como requisito. | `plan.py` → `quitar_materia_del_plan`. |
| No se puede borrar una materia referenciada (plan, matriculas, etc.). | `materias.py` → `eliminar_materia` (ForeignKeyViolation -> 409). |
| Periodo con `fecha_inicio <= fecha_fin`. | `periodos.py` → `crear_periodo` + CHECK de `V3__periodos.sql`. |
| El estudiante ve su carrito solo con materias de su plan. | `estudiantes.py` → `materias_disponibles` (JOIN `plan_estudios`). |

## PDF

| Regla | Donde se valida |
|---|---|
| Estudiante solo sus PDF; profesor solo de estudiantes matriculados en sus materias; admin todos. | `pdf.py` → `_verificar_permiso_pdf` (usado por los dos GET). |
| El recibo incluye radicado, periodo, fecha y total de creditos. | `backend/app/pdf_reportes.py` → `generar_pdf_matricula`. |
