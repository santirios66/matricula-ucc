# Guía de presentación — API + Portal (5 minutos)

Todo se ejecuta en tu PC, sin instalar nada nuevo. Solo dos terminales y un navegador.

## 0. Antes de empezar (una sola vez, ya hecho)

1. **PostgreSQL corriendo** (servicio iniciado; compruébalo en pgAdmin o `services.msc`).
2. **Base de datos creada** con las migraciones en este orden, desde pgAdmin → Query Tool:
   1. `backend/migrations/V1__crear_tablas.sql` (tablas)
   2. `backend/migrations/V2__datos_prueba.sql` (datos: F01, P01, PR01–03, M01–03, estudiante 1001)
3. **`backend/.env`** con tus datos reales (no está en GitHub, no lo compartas):
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=tu_base_de_datos
   DB_USER=postgres
   DB_PASSWORD=tu_contrasena_local
   ```
4. **Cuenta de administrador** creada (para los POST del portal): `python backend/app/crear_admin.py` — la clave temporal se muestra una sola vez, anótala.
5. **Dependencias** en el venv: `pip install -r backend/requirements.txt` (FastAPI, uvicorn, psycopg2-binary, reportlab, python-dotenv).

## 1. Levantar la API (terminal 1)

```powershell
cd backend
uvicorn app.main:app --reload
```
Queda corriendo en `http://127.0.0.1:8000`. Déjala abierta.

## 2. Levantar el portal (terminal 2)

```powershell
# desde la raíz del repo (otra terminal)
python frontend/servir.py
```
Quede corriendo en `http://localhost:5173`. Déjala abierta.

## 3. Enlaces que se abren en tu PC

| Enlace | Qué es |
|---|---|
| `http://localhost:8000/docs` | Documentación interactiva de la API (Swagger, probable con botones) |
| `http://localhost:5173` | Portal web del frontend |

⚠️ **Ambos enlaces solo funcionan mientras las dos terminales sigan corriendo.** Si cierras una (Ctrl+C), su enlace deja de responder; vuélvelas a levantar con los comandos de los pasos 1 y 2.

## 4. Guion de la demo (≈ 5 minutos)

**Minuto 0–1 · El repo en GitHub**
- Abre `github.com/santirios66/matricula-ucc`: muestra `backend/` (API FastAPI), `frontend/` (portal), `docs/api.md` (contrato con roles y códigos de error) y `escritorio/` (la versión Tkinter original, solo referencia).

**Minuto 1–2 · La API en `/docs`**
- Abre `http://localhost:8000/docs` → `GET /facultades/` → *Try it out* → **200** con `F01 · Ingeniería` (viene de V2).
- `POST /facultades/` con `{"id_facultad":"F02","nombre_facultad":"Salud"}` → **401/403**: cuenta que los POST de catálogo exigen credenciales de Administrador (`X-Usuario`/`X-Clave`).

**Minuto 2–3 · Login y POST como admin**
- `POST /auth/login` con tu usuario y clave de admin → **200** con `rol: "Administrador"`.
- En `POST /facultades/` pulsa *Try it out*, crea `F02 · Salud` → **201**. Repítelo igual → **409** `Ya existe una facultad con ID 'F02'`. Ese es el mensaje para la base de datos: clave primaria protegida.

**Minuto 3–4 · El portal**
- Abre `http://localhost:5173`. Panel izquierdo → usuario y clave de admin → **Aplicar credenciales** (aclara: *solo viven en la memoria de esta pestaña, no en el navegador*).
- Crea la facultad `F03 · Economía` desde el formulario → aparece en la tabla (viene de PostgreSQL).
- En `http://localhost:8000/docs` haz un `GET /facultades/` → ya está `F03`: **el portal y la API leen la misma base**.

**Minuto 4–5 · Seguridad por rol**
- Repite un POST **sin credenciales** (botón *Limpiar* en el portal) → el portal muestra el mensaje de iniciar sesión como administrador (401/403).
- Opcional: con un usuario estudiante (`1001` y su clave) intenta un POST → **403** `se requiere rol Administrador`; y un `GET /matriculas/` con sus encabezados → solo ve **sus** matrículas (un profesor solo ve las de sus materias).

## 5. Tres preguntas probables del profe

**¿Dónde guarda las contraseñas?**
Nunca en texto: `seguridad.py` genera sal aleatoria y aplica PBKDF2-SHA256 con 200.000 iteraciones; en la tabla `usuarios` solo van `sal` y `password_hash`. Al verificar usa comparación en tiempo constante (`hmac.compare_digest`), y el API jamás devuelve sal ni hash.

**¿Qué pasa si dos personas matriculan a la vez la misma materia?**
La base protege con `UNIQUE (cedula, id_materia, periodo)`: el segundo insert lanza `UniqueViolation`, que el API convierte en 409. En el carrito por lote todo va en **una transacción**: si algo falla, se hace `rollback()` y no queda nada parcial.

**¿Por qué los POST piden X-Usuario y X-Clave en los encabezados?**
Porque la API tiene control de acceso por rol (`seguridad_api.py`): verifica las credenciales contra la tabla `usuarios` y decide qué puede ver cada rol (el estudiante solo lo suyo, el profesor solo sus materias, el admin todo). Es una demo académica; en producción se usaría HTTPS + tokens (JWT) en lugar de encabezados en claro.

## Checklist rápido para el día de la demo

- [ ] PostgreSQL activo y base con V1+V2 aplicadas
- [ ] `backend/.env` con tus datos (no lo muestres en pantalla)
- [ ] Cuenta admin con clave conocida
- [ ] Terminal 1: `uvicorn app.main:app --reload` (desde `backend/`)
- [ ] Terminal 2: `python frontend/servir.py` (desde la raíz)
- [ ] Navegador: `localhost:8000/docs` y `localhost:5173`
