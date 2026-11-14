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

## 2. Inicio de sesión

Al abrir solo se ve la **pantalla de acceso**: logo, un texto corto y el formulario de usuario y clave. El menú y las demás pantallas están ocultos hasta iniciar sesión.

- **Clic sin sesión:** cualquier clic en menús o botones antes de entrar muestra el aviso **"Inicia sesión para continuar"** y no cambia de pantalla.
- `POST /auth/login` con usuario y clave:
  - **401** → "Usuario o contraseña incorrectos" (mensaje genérico; no abre sesión).
  - **200 con `debe_cambiar_clave: true`** → diálogo obligatorio de cambio de clave (`POST /auth/cambiar-clave`); no se entra al menú hasta cambiarla.
  - **200 normal** → se guarda en memoria el `usuario`, `rol` e `id_persona` que devolvió la API y se muestra el menú del rol. Esa respuesta es la única fuente de verdad del rol.
- **Credenciales solo en memoria** (variable `SESION` del JS): nada en `localStorage`, `sessionStorage` ni cookies. **Cerrar sesión** borra la memoria y vuelve a la pantalla de acceso.
- Las peticiones autenticadas envían los encabezados `X-Usuario` y `X-Clave` (incluidas las descargas de PDF, con `fetch` + blob).
- Si la API responde **403**, el portal muestra "No tienes permiso para esta acción" y no cambia de pantalla. Para los demás errores se muestra el `detail` que devuelve la API.

## 3. Qué ve cada rol

### Administrador
Menú: **Resumen · Facultades · Programas · Materias · Profesores · Estudiantes · Periodos · Cuentas**.
- Resumen con totales de cada catálogo y accesos directos.
- Registro en los seis catálogos (incluido **Periodos** de matrícula, `POST /periodos/`).
- **Cuentas:** crear cuenta de estudiante (`POST /auth/crear-cuenta-estudiante`) o de profesor (`POST /auth/crear-cuenta-profesor`) y restablecer la clave de cualquier usuario. La clave temporal se muestra una sola vez en pantalla.

### Estudiante
Menú: **Matricular · Mis notas · Mis documentos**.
- **Matricular:** carrito con `GET /estudiantes/{cedula}/materias-disponibles` (materias de su facultad), **total de créditos en vivo** (verde entre 6 y 19, rojo fuera del rango) y confirmación con `POST /matriculas/lote`.
- **Mis notas:** `GET /notas/` (la API solo devuelve las suyas).
- **Mis documentos:** recibo de matrícula y reporte de notas en PDF con su propia cédula.

### Profesor
Menú: **Ingresar notas · Reportes**.
- **Ingresar notas:** elige una de **sus** materias (las que tienen `id_profesor` = su `id_persona`), ve los estudiantes matriculados en esa materia y guarda las tres notas con `POST /notas/` (la API rechaza materias ajenas con 403).
- **Reportes:** PDF de notas y recibo de matrícula de sus estudiantes.

Ningún estudiante o profesor ve formularios de catálogo: el menú se construye desde `MENUS[rol]` en `frontend/app.js`.

## 4. Rutas reales del repo

```
MatriculaUniversitaria_v3/
├── backend/            # API FastAPI
│   ├── app/
│   │   ├── main.py             # FastAPI + CORS 5173 + routers
│   │   ├── database.py         # conexión con .env
│   │   ├── seguridad_api.py    # control de acceso por rol (X-Usuario / X-Clave)
│   │   ├── pdf_reportes.py     # recibos y reportes con radicado
│   │   └── routers/            # facultades, programas, materias, profesores,
│   │                           # estudiantes, matriculas, notas, auth, pdf, periodos
│   └── migrations/     # V1 tablas, V2 datos de prueba, V3 periodos
├── frontend/           # este portal (index.html, app.js, styles.css, config.js, servir.py)
├── docs/               # api.md (contrato de la API) y frontend.md (este archivo)
├── escritorio/         # app Tkinter original, solo referencia
└── README.md
```

- `frontend/config.js` apunta a `http://localhost:8000` (`API_BASE_URL`).
- `frontend/servir.py` sirve la carpeta en el puerto 5173 con `http.server`.

## 5. Diferencias corregidas respecto al ZIP original

- El ZIP afirmaba que *la API no tiene autenticación*: ya no es cierto. La API ahora tiene `/auth/*` y control de acceso por rol; el portal inicia sesión de verdad (`POST /auth/login`) y envía `X-Usuario`/`X-Clave` en cada petición autenticada.
- El ZIP usaba rutas `matricula-ucc-main/backend` y `matricula-ucc-main/`: en el repo no existe ese árbol; la API vive en `backend/` y el portal en `frontend/` (guía actualizada).
- No se copiaron archivos de la versión vieja: `matricula-ucc-main/`, `pruebas/`, `iniciar_backend.bat`, `backend.env.example`. El arranque es `uvicorn` desde `backend/` + `python frontend/servir.py`.
- El texto "Sesión de administrador lista" y cualquier mensaje que afirmara un rol sin validarlo se eliminaron: el rol ahora lo decide la respuesta de `/auth/login`.

## 6. Flujo de demo sugerido

1. **Admin** entra → crea una facultad, un programa, un profesor, un estudiante y un periodo (o usa los datos de V2/BD).
2. En **Cuentas**, crea la cuenta de ese estudiante → la clave temporal se muestra una vez.
3. **Estudiante** entra con la clave temporal → cambia la clave (obligatorio) → arma el carrito (total entre 6 y 19) → confirma → descarga su recibo (radicado + periodo).
4. Intenta matricular fuera del rango de créditos o una materia sin cupo → la API responde 422/409 con el mensaje.
5. **Profesor** entra → elige su materia → registra notas → el estudiante las ve en **Mis notas**.
