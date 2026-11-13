# Contrato de la API — Matrícula Universitaria

Base: `http://localhost:8000` · Documentación interactiva: `http://localhost:8000/docs`

## Autenticación de las rutas protegidas

Salvo `/health`, `/`, `/auth/*`, los `GET` de catálogos (`/facultades/`, `/programas/`, `/materias/`, `/profesores/`, `/estudiantes/`) y los POST marcados, toda petición exige los encabezados:

| Encabezado | Contenido |
|---|---|
| `X-Usuario` | nombre del usuario en la tabla `usuarios` |
| `X-Clave` | contraseña en texto plano (solo viaja por HTTP local/red interna) |

Los tres roles posibles son `Administrador`, `Profesor` y `Estudiante` (columna `rol` de `usuarios`).

Respuestas de error comunes:

- `401` — faltan encabezados o credenciales incorrectas: `{"detail": "Usuario o contraseña incorrectos"}`.
- `403` — credenciales válidas pero rol insuficiente.
- `422` — validación de datos (Pydantic o chequeos explícitos).

---

## Salud

### `GET /health`
- **Rol:** público.
- **Salida:** `{"estado": "ok"}`.
- **Errores:** ninguno.

### `GET /`
- **Rol:** público.
- **Salida:** `{"mensaje": "API de Matrícula Universitaria en funcionamiento"}`.

---

## Autenticación — `backend/app/routers/auth.py`

### `POST /auth/login`
- **Rol:** público (define la sesión).
- **Entrada:**
```json
{"usuario": "admin", "clave": "MiClave123"}
```
- **Salida 200:**
```json
{"usuario": "admin", "rol": "Administrador", "id_persona": null, "debe_cambiar_clave": false}
```
- **Errores:** `401` credenciales incorrectas (mensaje genérico); `422` campos vacíos.

### `POST /auth/cambiar-clave`
- **Rol:** cualquier usuario autenticado (se verifica con sus propias credenciales).
- **Entrada:**
```json
{"usuario": "1001", "clave_actual": "TempAbc9", "clave_nueva": "NuevaClave123"}
```
- **Salida 200:** `{"mensaje": "Contraseña actualizada"}`.
- **Errores:** `401` clave actual incorrecta; `422` clave nueva con menos de 8 caracteres o igual a la actual.

### `POST /auth/restablecer-clave` (solo admin)
- **Rol:** `Administrador` (verificado con `usuario_admin`/`clave_admin`).
- **Entrada:**
```json
{"usuario_admin": "admin", "clave_admin": "NuevaClave123", "usuario_objetivo": "1001"}
```
- **Salida 200:** `{"usuario": "1001", "clave_temporal": "pQ7mXk2z"}` (única vez que se devuelve la clave).
- **Errores:** `403` si `usuario_admin` no es Administrador; `401` si su clave falla; `404` si no existe `usuario_objetivo`.

---

## Facultades — `backend/app/routers/facultades.py`

### `GET /facultades/`
- **Rol:** público.
- **Salida 200:** `[{"id_facultad": "F01", "nombre_facultad": "Ingeniería"}]`.

### `POST /facultades/`
- **Rol:** solo `Administrador` (si no, `403`).
- **Entrada:** `{"id_facultad": "F02", "nombre_facultad": "Salud"}` (mínimo 1 carácter cada campo).
- **Salida 201:** la misma facultad creada.
- **Errores:** `403` no admin; `409` ID duplicado; `422` validación.

---

## Programas — `backend/app/routers/programas.py`

### `GET /programas/`
- **Rol:** público.
- **Salida 200:** `[{"id_programa": "P01", "nombre_programa": "Ingeniería de Sistemas", "id_facultad": "F01"}]`.

### `POST /programas/`
- **Rol:** solo `Administrador`.
- **Entrada:** `{"id_programa": "P02", "nombre_programa": "Enfermería", "id_facultad": "F01"}`.
- **Salida 201:** el programa creado.
- **Errores:** `403` no admin; `404` la facultad no existe; `409` ID duplicado; `422` validación.

---

## Materias — `backend/app/routers/materias.py`

### `GET /materias/`
- **Rol:** público.
- **Salida 200:** `[{"id_materia": "M01", "nombre_curso": "Programación en Java", "creditos": 4, "cupos": 20, "id_facultad": "F01", "horario": "Lunes 8:00am - 10:00am", "id_profesor": "PR01"}]`.

### `POST /materias/`
- **Rol:** solo `Administrador`.
- **Entrada:**
```json
{"id_materia": "M06", "nombre_curso": "Cálculo", "creditos": 3, "cupos": 20, "id_facultad": "F01", "horario": "Miércoles 10:00am", "id_profesor": "PR01"}
```
- `creditos` entero > 0; `cupos` entero >= 0 (por defecto 20); `horario` opcional (vacío → `null`).
- **Salida 201:** la materia creada.
- **Errores:** `403` no admin; `404` facultad o profesor inexistente; `409` ID duplicado; `422` validación.

---

## Profesores — `backend/app/routers/profesores.py`

### `GET /profesores/`
- **Rol:** público.
- **Salida 200:** `[{"id_profesor": "PR01", "nombre": "Carlos", "apellidos": "Perez"}]`.

### `POST /profesores/`
- **Rol:** solo `Administrador`.
- **Entrada:** `{"id_profesor": "PR04", "nombre": "Laura", "apellidos": "Rios"}`.
- **Salida 201:** el profesor creado.
- **Errores:** `403` no admin; `409` ID duplicado; `422` validación.

---

## Estudiantes — `backend/app/routers/estudiantes.py`

### `GET /estudiantes/`
- **Rol:** público.
- **Salida 200:** `[{"id_estudiante": "1001", "nombre": "Santiago", "apellidos": "Patiño Ríos", "correo": "santiago.patino@ucc.edu.co", "telefono": "3000000000", "semestre": 4, "id_programa": "P01"}]`.

### `POST /estudiantes/`
- **Rol:** solo `Administrador`.
- **Entrada:**
```json
{"id_estudiante": "1002", "nombre": "Ana", "apellidos": "Lopez", "correo": "ana@ucc.edu.co", "telefono": null, "semestre": 2, "id_programa": "P01"}
```
- `correo` debe contener `@`; `telefono` opcional; `semestre` entero > 0.
- **Salida 201:** el estudiante creado.
- **Errores:** `403` no admin; `404` programa inexistente; `409` ID duplicado; `422` validación.

### `GET /estudiantes/{cedula}/materias-disponibles`
- **Rol:** público.
- **Descripción:** materias de la facultad del programa del estudiante (JOIN `estudiantes → programas → materias`), para armar el carrito.
- **Salida 200:**
```json
[
  {"id_estudiante": "1001", "id_programa": "P01", "id_facultad": "F01",
   "id_materia": "M01", "nombre_curso": "Programación en Java", "creditos": 4,
   "cupos": 20, "horario": "Lunes 8:00am - 10:00am", "id_profesor": "PR01"}
]
```
- **Errores:** `404` cédula inexistente; `422` cédula vacía.

---

## Matrículas — `backend/app/routers/matriculas.py`

Requiere `X-Usuario`/`X-Clave`.

### `GET /matriculas/` (filtrado por rol)
- **Salida 200:** `[{"id_matricula": "96317481", "cedula": "1001", "id_materia": "M01", "creditos": 4, "periodo": "2026-2", "fecha_matricula": "2026-11-06", "estado": "Activa"}]`.
- **Visibilidad:**
  - `Estudiante`: solo sus matrículas (`cedula` = su `id_persona`).
  - `Profesor`: matrículas de las materias que dicta (`materias.id_profesor` = su `id_persona`).
  - `Administrador`: todas.
- **Errores:** `401` credenciales.

### `POST /matriculas/`
- **Rol:** todos los roles (el estudiante se matricula a sí mismo usando su cédula).
- **Entrada:**
```json
{"cedula": "1001", "id_materia": "M01", "periodo": "2026-2"}
```
- El servidor genera `id_matricula` (8 caracteres), toma `creditos` de la materia y fija `estado: "Activa"`.
- **Salida 201:** la matrícula creada (incluye `fecha_matricula`).
- **Errores:** `404` estudiante o materia inexistente; `409` ya matriculada en ese periodo o se supera 19 créditos en el periodo; `422` validación.

### `POST /matriculas/lote`
- **Rol:** todos los roles.
- **Entrada:**
```json
{"cedula": "1001", "periodo": "2026-2", "id_materias": ["M01", "M02", "M03"]}
```
- **Salida 201:**
```json
{"cedula": "1001", "periodo": "2026-2", "total_creditos": 10,
 "matriculas": [{"id_matricula": "a1b2c3d4", "id_materia": "M01", "creditos": 4}]}
```
- **Errores:** `404` estudiante o alguna materia inexistente; `409` materia repetida dentro del carrito o ya matriculada en el periodo; `422` total de créditos fuera de 6–19, campos vacíos. Si algo falla, no se guarda ninguna matrícula (transacción única).

---

## Notas — `backend/app/routers/notas.py`

Requiere `X-Usuario`/`X-Clave`.

### `GET /notas/` (filtrado por rol)
- **Salida 200:**
```json
[{"id_nota": "abdf9d7b", "id_matricula": "96317481", "id_materia": "M01",
  "nota1": 4.0, "nota2": 3.5, "nota3": 4.5, "definitiva": 4.0, "estado": "Aprobado"}]
```
- **Visibilidad:**
  - `Estudiante`: solo sus notas.
  - `Profesor`: notas de sus materias (`materias.id_profesor` = su `id_persona`).
  - `Administrador`: todas.
- **Errores:** `401` credenciales.

### `POST /notas/`
- **Rol:** `Profesor` y `Administrador`.
- **Entrada:**
```json
{"id_matricula": "96317481", "nota1": 4.0, "nota2": 3.5, "nota3": 4.5}
```
- El servidor genera `id_nota` (8 caracteres), toma `id_materia` de la matrícula, calcula `definitiva = round((n1+n2+n3)/3, 2)` y `estado: "Aprobado"` si `definitiva >= 3.0`, si no `"Reprobado"`.
- **Salida 201:** la nota creada con `definitiva` y `estado`.
- **Errores:** `404` matrícula inexistente; `409` la matrícula ya tiene nota; `422` notas fuera del rango 0.0–5.0.

---

## PDF — `backend/app/routers/pdf.py`

Requiere `X-Usuario`/`X-Clave`.

### `GET /pdf/matricula/{cedula}`
- **Salida 200:** archivo PDF (`application/pdf`, `Recibo_Matricula_{cedula}.pdf`).
- **Visibilidad:**
  - `Estudiante`: solo su propia cédula (su `id_persona`); si no, `403`.
  - `Profesor`: solo cédulas con matrículas activas en materias que dicta; si no, `403`.
  - `Administrador`: cualquier cédula.
- **Errores:** `403` sin permiso; `404` estudiante inexistente o sin matrículas; `422` cédula vacía.

### `GET /pdf/notas/{cedula}`
- Igual que el anterior, pero genera `Reporte_Notas_{cedula}.pdf` (boletín de notas).
- **Errores:** idénticos.

---

## Matriz resumen de roles

| Endpoint | Público | Estudiante | Profesor | Administrador |
|---|---|---|---|---|
| `GET /health`, `GET /` | ✅ | ✅ | ✅ | ✅ |
| `POST /auth/login` | ✅ | ✅ | ✅ | ✅ |
| `POST /auth/cambiar-clave` | — | ✅ (sus credenciales) | ✅ | ✅ |
| `POST /auth/restablecer-clave` | — | ❌ | ❌ | ✅ |
| `GET /facultades/ /programas/ /materias/ /profesores/ /estudiantes/` | ✅ | ✅ | ✅ | ✅ |
| `POST /facultades/ /programas/ /materias/ /profesores/ /estudiantes/` | — | ❌ 403 | ❌ 403 | ✅ |
| `GET /estudiantes/{cedula}/materias-disponibles` | ✅ | ✅ | ✅ | ✅ |
| `GET /matriculas/` | — | solo las suyas | solo sus materias | todas |
| `POST /matriculas/`, `POST /matriculas/lote` | — | ✅ | ✅ | ✅ |
| `GET /notas/` | — | solo las suyas | solo sus materias | todas |
| `POST /notas/` | — | ❌ | ✅ | ✅ |
| `GET /pdf/matricula/{cedula}`, `GET /pdf/notas/{cedula}` | — | solo su cédula | solo sus estudiantes | todas |

## Cómo probar con dos usuarios (PowerShell)

```powershell
# Estudiante (X-Usuario/X-Clave de una cuenta con rol Estudiante e id_persona = cédula)
$h_est = @{ "X-Usuario" = "1001"; "X-Clave" = "SU_CLAVE" }
Invoke-RestMethod -Headers $h_est http://localhost:8000/matriculas/          # solo sus matrículas
Invoke-RestMethod -Headers $h_est http://localhost:8000/pdf/matricula/1002   # 403

# Administrador (cuenta admin; id_persona = null)
$h_adm = @{ "X-Usuario" = "admin"; "X-Clave" = "SU_CLAVE_ADMIN" }
Invoke-RestMethod -Headers $h_adm http://localhost:8000/matriculas/          # todas
Invoke-RestMethod -Headers $h_adm -Method Post -Uri http://localhost:8000/facultades/ `
  -ContentType "application/json" -Body '{"id_facultad":"F02","nombre_facultad":"Salud"}'   # 201
Invoke-RestMethod http://localhost:8000/facultades/                          # público, sin encabezados

# Lote (carrito completo)
Invoke-RestMethod -Method Post -Uri http://localhost:8000/matriculas/lote -Headers $h_est `
  -ContentType "application/json" -Body '{"cedula":"1001","periodo":"2026-2","id_materias":["M01","M02","M03"]}'
```
