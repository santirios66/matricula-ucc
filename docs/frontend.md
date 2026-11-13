# Portal web (frontend/)

Guía del portal estático de `frontend/`, integrado en este repo al mismo nivel que `backend/`. Es HTML/CSS/JavaScript sin npm, sin build y sin Node: el navegador consume la API FastAPI directamente.

> Requisito: la API debe estar corriendo con su `.env` (credenciales de PostgreSQL, nunca en el código). Véase `docs/api.md` para el contrato completo de la API.

## 1. Arrancar

```powershell
# Terminal 1 — API (desde backend/)
cd backend
uvicorn app.main:app --reload

# Terminal 2 — portal (desde la raíz del repo)
python frontend/servir.py
```

Abre **exactamente** `http://localhost:5173` (CORS del backend solo autoriza ese origen). No abras `index.html` con doble clic ni uses Live Server. Detén cada servidor con Ctrl+C.

## 2. Qué hace el portal hoy

- **Consulta y registro** de los cinco catálogos: facultades, programas, profesores, estudiantes y materias (`GET` y `POST` en sus rutas reales del repo: `backend/app/routers/`).
- **Sesión de administrador en memoria:** los `POST` de catálogo exigen los encabezados `X-Usuario` y `X-Clave` (control de acceso por rol de `backend/app/seguridad_api.py`). El panel izquierdo del portal pide usuario y clave del administrador y los envía en cada `POST`.
- **Las credenciales solo viven en la memoria de la pestaña** (campos del panel). No se guardan en `localStorage`, `sessionStorage`, cookies ni en el código. El botón "Limpiar" las borra al instante.
- Si la API responde **401 o 403**, el formulario muestra un mensaje claro sobre iniciar sesión como administrador.
- Búsqueda, totales, formularios con relaciones (programa→facultad, materia→facultad+profesor), estados de carga y errores visibles.

## 3. Rutas reales del repo

```
MatriculaUniversitaria_v3/
├── backend/            # API FastAPI (no se toca desde esta rama)
│   ├── app/
│   │   ├── main.py             # FastAPI + CORS 5173 + routers
│   │   ├── database.py         # conexión con .env
│   │   ├── seguridad_api.py    # control de acceso por rol (X-Usuario / X-Clave)
│   │   └── routers/            # facultades, programas, materias, profesores,
│   │                           # estudiantes, matriculas, notas, auth, pdf
│   └── migrations/     # V1 tablas, V2 datos de prueba
├── frontend/           # este portal (index.html, app.js, styles.css, config.js, servir.py)
├── docs/               # api.md (contrato de la API) y frontend.md (este archivo)
├── escritorio/         # app Tkinter original, solo referencia
└── README.md
```

- `frontend/config.js` apunta a `http://localhost:8000` (`API_BASE_URL`).
- `frontend/servir.py` sirve la carpeta en el puerto 5173 con `http.server`.

## 4. Probar la sesión de administrador

1. Arranca API y portal (paso 1). En el panel izquierdo escribe el usuario y la clave del administrador y pulsa **Aplicar credenciales** (verás "solo en memoria").
2. Ve a **Facultades → + Registrar facultad**, crea `F02 · Salud` → se guarda (201).
3. Repite el mismo registro → el API devuelve **409** y el portal muestra `Ya existe una facultad con ID 'F02'`.
4. Pulsa **Limpiar** en el panel e intenta crear otra facultad → **401/403** con el mensaje de iniciar sesión como administrador.

## 5. Diferencias corregidas respecto al ZIP original

- El ZIP afirmaba que *la API no tiene autenticación*: ya no es cierto. La API ahora tiene `/auth/*` y control de acceso por rol; los `POST` de catálogo exigen credenciales de Administrador. El portal las envía y maneja 401/403. No se copió esa afirmación ni `REVISION.md`/`LEEME_PRIMERO.md` del ZIP.
- El ZIP usaba rutas `matricula-ucc-main/backend` y `matricula-ucc-main/`: en el repo no existe ese árbol; la API vive en `backend/` y el portal en `frontend/` (guía actualizada).
- No se copiaron archivos de la versión vieja: `matricula-ucc-main/`, `pruebas/`, `iniciar_backend.bat`, `backend.env.example`. El arranque es `uvicorn` desde `backend/` + `python frontend/servir.py`.

## 6. Pendiente del portal (la API ya lo tiene; no implementado aún)

Estos módulos existen en `backend/app/routers/` y el portal todavía no muestra pantallas para ellos:

| Pantalla faltante | Endpoint que usaría | Regla de negocio | ¿Requiere sesión? |
|---|---|---|---|
| Matrículas (listado, registro individual) | `GET /matriculas/`, `POST /matriculas/` | Máx. 19 créditos por periodo por estudiante (calculado con `SUM` en SQL); no repetir materia en el mismo periodo | `Estudiante` ve solo lo suyo (`id_persona` = cédula); `Profesor` solo matrículas de sus materias; `Administrador` todo → **requiere sesión** |
| Carrito de matrícula (lote) | `POST /matriculas/lote` | Total del periodo entre **6 y 19 créditos**; transacción única: si algo falla no guarda nada; materias repetidas → 409 | Igual que arriba → **requiere sesión** |
| Notas | `GET /notas/`, `POST /notas/` | Cada nota 0.0–5.0; definitiva = promedio (Python, 2 decimales); Aprobado si `>= 3.0`; una sola nota por matrícula | `Profesor` solo notas de sus materias; `Estudiante` solo las suyas → **requiere sesión** |
| Materias disponibles del estudiante | `GET /estudiantes/{cedula}/materias-disponibles` | Se filtra por la **facultad del programa** del estudiante (JOIN `estudiantes → programas → materias`) | **Pública** hoy en la API (el portal puede llamarla sin encabezados) |
| Login | `POST /auth/login` | Mensaje genérico 401; devuelve rol e `id_persona` sin sal ni hash | **Pública** |
| Cambio/restablecimiento de clave | `POST /auth/cambiar-clave`, `POST /auth/restablecer-clave` | Nueva clave ≥ 8 caracteres y distinta; restablecer solo admin genera clave temporal | Cambiar: cualquier usuario; restablecer: **solo admin** |
| Reportes PDF | `GET /pdf/matricula/{cedula}`, `GET /pdf/notas/{cedula}` | Estudiante solo su cédula; profesor solo estudiantes matriculados en sus materias; descarga como archivo | **Requiere sesión** (403 si no) |

**Los dos más importantes para una demo de clase:**

1. **Carrito de matrícula (`POST /matriculas/lote` + `GET /estudiantes/{cedula}/materias-disponibles`):** es el corazón del sistema (de ahí el nombre) y enseña en una sola demo la regla de 6–19 créditos, el filtro por facultad y la transacción "todo o nada". Fallar a propósito (lote de 3 créditos → 422) demuestra validación real.
2. **Login (`POST /auth/login`) + Notas con filtro por rol (`GET/POST /notas/`):** muestra la capa de seguridad que se construyó en el backend (hash con sal, mensaje genérico 401, un profesor solo ve sus materias). En la demo se ve el mismo endpoint devolviendo datos distintos según el rol, lo que justifica los encabezados que el portal ya envía en los POST.
