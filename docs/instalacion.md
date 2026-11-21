# Instalacion (Windows, paso a paso)

Guia verificada contra el codigo actual del repo. Requisitos: **Python 3.10+** y **PostgreSQL 12 o superior** (probado con instancias locales en los puertos 5432/5433).

## 1. PostgreSQL

1. Instala PostgreSQL y deja el servicio iniciado.
2. En pgAdmin (o `psql`) crea una base vacia, por ejemplo `Matricula`.

## 2. Migraciones V1 a V10, en orden

Aplica cada archivo de `backend/migrations/` en pgAdmin con **Query Tool** (abrir, pegar, ejecutar) o con `psql -d Matricula -f ...`. El orden es obligatorio porque unas tablas referencian a otras; todas son idempotentes (pueden repetirse sin romper datos):

| Orden | Archivo | Que crea |
|---|---|---|
| 1 | `V1__crear_tablas.sql` | Las 8 tablas base: facultades, programas, profesores, materias, estudiantes, matriculas, notas, usuarios. |
| 2 | `V2__datos_prueba.sql` | Datos demo: F01, P01, PR01-PR03, M01-M03 y el estudiante 1001. |
| 3 | `V3__periodos.sql` | Tabla `periodos` y el periodo 2026-2 (2026-11-01 a 2026-12-20). |
| 4 | `V4__tareas.sql` | Tablas `tareas` y `entregas`. |
| 5 | `V5__tipo_tarea.sql` | `tareas.tipo` (taller/quiz/examen/trabajo) y `entregas.calificacion`. |
| 6 | `V6__momento_tarea.sql` | `tareas.momento` (1 a 3, nullable). |
| 7 | `V7__plan_estudios.sql` | Tabla `plan_estudios` y `programas.plan_referencia`. |
| 8 | `V8__requisitos.sql` | Tabla `requisitos` (materias previas). |
| 9 | `V9__matricula_cabecera.sql` | Tabla `matriculas_lote` (radicado) y `matriculas.id_lote`. |
| 10 | `V10__horario_materias.sql` | `materias.dia`, `hora_inicio`, `hora_fin`. |

## 3. backend/.env

`backend/app/database.py` lee las credenciales desde `backend/.env` (nunca desde el codigo). Crea `backend/.env` con:

```ini
DB_HOST=localhost
DB_PORT=5432
DB_NAME=Matricula
DB_USER=postgres
DB_PASSWORD=tu_contrasena
```

Ajusta `DB_PORT` si tu PostgreSQL usa otro puerto y `DB_NAME` si llamaste distinta la base. `DB_HOST`, `DB_NAME`, `DB_USER` y `DB_PASSWORD` son obligatorios; si falta alguno, la API falla con `RuntimeError: Faltan variables de entorno...`.

Nota: **no existe un archivo `.env.example` en el repositorio** (pendiente). `backend/.env` esta en `.gitignore` y no se publica. La plantilla antigua `backend/app/conexion_ejemplo.py` pertenece al legado de escritorio y no la usa la API.

## 4. Entorno virtual y dependencias

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

`requirements.txt`: fastapi, uvicorn, psycopg2-binary, reportlab, python-dotenv, python-multipart. (La app de escritorio de `escritorio/` usaba ademas customtkinter y pillow; no se necesitan para la API ni el portal.)

## 5. Cuenta admin inicial

```powershell
cd backend\app
python crear_admin.py
```

Crea el usuario `admin` con una clave temporal que **solo se muestra esa vez**; al primer ingreso el portal exige cambiarla. Si `admin` ya existe, no crea nada. El script usa `backend/.env` via `database.py`.

## 6. Arrancar la API

```powershell
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload
```

La API queda en `http://localhost:8000`. Verifica:

- `http://localhost:8000/health` devuelve `{"estado": "ok"}`.
- `http://localhost:8000/docs` abre la documentacion interactiva de FastAPI.

## 7. Arrancar el portal

En otra terminal, desde la raiz del repo:

```powershell
python frontend/servir.py
```

Abre **exactamente** `http://localhost:5173 (el CORS del backend solo autoriza ese origen; no abras index.html con doble clic). Entra como `admin` con la clave temporal, cambiala y desde **Cuentas** crea las cuentas de estudiante y profesor que necesites.

## 8. Datos de referencia (opcional, demo)

Los dos scripts de `backend/scripts/` leen `backend/.env` y son idempotentes; cargan los planes y requisitos de demo de los programas P01, P02 y P03:

```powershell
cd backend
python scripts\cargar_plan_referencia.py
python scripts\cargar_requisitos_referencia.py
```

- `cargar_plan_referencia.py` reinicia SOLO los planes de P01/P02/P03 (crea sus programas y materias) y marca `plan_referencia = TRUE`.
- `cargar_requisitos_referencia.py` reinicia SOLO los requisitos de las materias de referencia (por ejemplo, Calculo 2 requiere Calculo 1).

Con V2 + estos scripts el estudiante 1001 ve un tablero con varios semestres, materias bloqueadas por requisito y tareas de ejemplo.

## 9. Verificacion rapida

1. Login como admin en `http://localhost:5173`: aparece el menu completo de administrador.
2. Crea una cuenta de estudiante desde **Cuentas** (usa una cedula registrada en Estudiantes) y una de profesor (usa un ID de Profesores).
3. Entra como estudiante: **Matricular** muestra el tablero por semestre con el carrito a la derecha.
4. Entra como profesor: **Ingresar notas** lista solo sus materias; **Tareas** permite crear una tarea y ver entregas.
