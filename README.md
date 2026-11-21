# Matricula UCC — Sistema de matricula academica (API + portal web)

![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-API-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-12%2B-336791?logo=postgresql&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)

Sistema de gestion academica para la **Universidad Cooperativa de Colombia, Sede Cali**: una API **FastAPI** con **PostgreSQL** y un **portal web** en JavaScript puro (sin npm, sin build). Proyecto de la asignatura de **Ingenieria de Sistemas**.

Empezo como ejercicio de escritorio con Excel; por pedido del profesor evoluciono a un sistema con login por roles, carrito de matricula, plan de estudios, requisitos previos, tareas con entregas, notas por momentos, reportes PDF y base de datos relacional. La app de escritorio original queda en `escritorio/` solo como referencia.

## Estado del proyecto

En desarrollo activo. Funcional en local con PostgreSQL, los tres roles operativos y las reglas de negocio validadas por suites de pruebas documentadas en `docs/pruebas.md`. No hay despliegue en produccion, ni CI, ni HTTPS: es un proyecto academico que corre en `localhost` (ver `docs/limitaciones.md`).

## Estructura real del repositorio

```
MatriculaUniversitaria_v3/
├── backend/                  # API FastAPI
│   ├── app/
│   │   ├── main.py           # FastAPI + CORS (solo localhost:5173) + routers
│   │   ├── database.py       # conexion a PostgreSQL desde backend/.env
│   │   ├── seguridad_api.py   # roles y autenticacion X-Usuario / X-Clave
│   │   ├── seguridad.py      # hash PBKDF2 y claves temporales
│   │   ├── db_postgres.py    # consultas reutilizadas por auth.py
│   │   ├── calculo_notas.py   # notas N1/N2/N3 calculadas desde tareas
│   │   ├── pdf_reportes.py   # recibo de matricula y boletin de notas
│   │   ├── crear_admin.py    # crea la cuenta admin con clave temporal
│   │   ├── conexion_ejemplo.py  # plantilla del legado de escritorio
│   │   └── routers/          # auth, facultades, programas, plan, materias,
│   │                         # profesores, estudiantes, matriculas, notas,
│   │                         # periodos, tareas, pdf
│   ├── migrations/           # V1..V10, en orden, idempotentes
│   ├── scripts/              # planes y requisitos de referencia (demo)
│   ├── archivos/             # archivos de apoyo y entregas (ignorado por git)
│   ├── .env                  # credenciales locales (ignorado por git)
│   └── requirements.txt      # fastapi, uvicorn, psycopg2-binary, reportlab,
│                             # python-dotenv, python-multipart
├── frontend/                 # portal web estatico
│   ├── index.html            # login + shell de la app
│   ├── app.js                # vistas por rol, carrito, tablero, filtros
│   ├── styles.css            # tema claro y oscuro
│   ├── config.js             # API_BASE_URL -> http://localhost:8000
│   └── servir.py             # servidor estatico en http://localhost:5173
├── docs/                     # api.md, frontend.md, instalacion.md,
│                             # reglas_negocio.md, pruebas.md, limitaciones.md,
│                             # presentacion.md, pruebas_*.md
├── escritorio/               # app Tkinter original (solo referencia)
├── conexion.py               # conexion del legado de escritorio (ignorado por git)
└── README.md
```

## Instalacion rapida

Guia completa paso a paso en [`docs/instalacion.md`](docs/instalacion.md). Resumen:

1. PostgreSQL con una base vacia (por ejemplo `Matricula`).
2. Migraciones `backend/migrations/V1..V10` en orden (pgAdmin o psql).
3. `backend/.env` con `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
4. `pip install -r backend/requirements.txt` dentro de un `.venv`.
5. `cd backend && uvicorn app.main:app --reload` (API en `http://localhost:8000`).
6. `python frontend/servir.py` (portal en `http://localhost:5173`).
7. `cd backend/app && python crear_admin.py` para la cuenta admin inicial.

## Roles

| Rol | Que ve en el portal |
|---|---|
| **Administrador** | Resumen, Facultades, Programas (con plan de estudios), Materias (con horario y edicion), Profesores, Estudiantes, Periodos y Cuentas. |
| **Estudiante** | Matricular (tablero por semestre, carrito, matricula guardada), Registro academico por periodo, Mis notas y Mis tareas (con filtros), Mis documentos (PDF). |
| **Profesor** | Ingresar notas (con sugerencias calculadas), Tareas de sus materias (creacion, entregas y calificaciones) y Reportes. |

Detalles por pantalla en [`docs/frontend.md`](docs/frontend.md).

## Documentacion

| Documento | Contenido |
|---|---|
| [`docs/instalacion.md`](docs/instalacion.md) | Instalacion en Windows, paso a paso, con migraciones y scripts. |
| [`docs/api.md`](docs/api.md) | Contrato completo de la API: metodo, ruta, rol, respuesta y errores. |
| [`docs/frontend.md`](docs/frontend.md) | Que ve cada rol en cada pantalla del portal. |
| [`docs/reglas_negocio.md`](docs/reglas_negocio.md) | Cada regla con el archivo y la funcion que la valida. |
| [`docs/pruebas.md`](docs/pruebas.md) | Indice de las suites de pruebas y su resultado documentado. |
| [`docs/limitaciones.md`](docs/limitaciones.md) | Lo que el sistema no hace, segun codigo y documentacion. |
| [`docs/presentacion.md`](docs/presentacion.md) | Guia de demostracion de 5 minutos. |

## Equipo

- Santiago Patino Rios
- Jairo Enrique Arboleda Trujillo

## Limitaciones

Proyecto academico: sin HTTPS ni tokens (las credenciales viajan por encabezados en local), sin limite de intentos de login, notas no editables una vez registradas, cupos calculados con `COUNT` (no se descuentan), archivos de tareas en disco local y mas en [`docs/limitaciones.md`](docs/limitaciones.md).
