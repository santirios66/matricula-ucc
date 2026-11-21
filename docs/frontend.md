# Portal web (frontend/)

Guia del portal estatico de `frontend/`: HTML/CSS/JavaScript puro, sin npm, sin build y sin Node. El navegador consume la API FastAPI directamente.

## 1. Arrancar

```powershell
# Terminal 1 — API (desde backend/)
cd backend
uvicorn app.main:app --reload

# Terminal 2 — portal (desde la raiz del repo)
python frontend/servir.py
```

Abre **exactamente** `http://localhost:5173` (el CORS del backend solo autoriza ese origen). No abras `index.html` con doble clic. Deten cada servidor con Ctrl+C.

## 2. Sesion y seguridad

- Login con `POST /auth/login`. Si responde `debe_cambiar_clave: true`, se abre el dialogo obligatorio de cambio de clave antes de entrar.
- La sesion vive **solo en memoria** (variable `SESION` en `app.js`): nada en `localStorage`, `sessionStorage` ni cookies. **Cerrar sesion** la borra y vuelve al login.
- Cada peticion autenticada envia `X-Usuario`/`X-Clave` (tambien las descargas de PDF, con `fetch` + blob).
- `401`/`403` se muestran como "No tienes permiso para esta accion"; otros errores muestran el `detail` del servidor tal cual.
- Boton flotante de **tema claro/oscuro** (estado solo en memoria; se pierde al recargar).

## 3. Administrador

Menu: **Resumen · Facultades · Programas · Materias · Profesores · Estudiantes · Periodos · Cuentas**.

- **Resumen:** totales de cada catalogo, grafico de matriculas del periodo activo por materia y accesos directos.
- **Facultades / Profesores / Estudiantes:** directorios con busqueda y registro (`POST` correspondiente).
- **Programas:** directorio con busqueda y filtro por facultad; cada programa abre su **plan de estudios** (`GET /programas/{id}/plan`): materias agrupadas por semestre, cambiar semestre u obligatoria (`PUT`), quitar del plan (`DELETE`) y agregar (`POST`).
- **Materias:** directorio con busqueda, filtro por facultad, editor con **selector visual de horario** (dia y horas, V10), editar (`PUT /materias/{id}`) y eliminar (`DELETE /materias/{id}`, bloqueado si hay referencias).
- **Periodos:** lista y creacion de periodos con su ventana de fechas (`POST /periodos/`).
- **Cuentas:** crear cuenta de estudiante o de profesor y restablecer claves; la clave temporal se muestra una sola vez.

## 4. Estudiante

Menu: **Matricular · Registro academico · Mis notas · Mis tareas · Mis documentos**.

- **Matricular:** arriba, el bloque **"Mi matricula del periodo"** con selector de periodo: muestra las materias ya matriculadas (codigo, nombre, creditos, estado); si el periodo **aun no comienza**, permite quitar/agregar materias con `PUT /matriculas/{id}` y eliminar la matricula con `DELETE /matriculas/{id}`; si ya comenzo, es **solo lectura**. Debajo, el **tablero por semestre** con las materias del plan (`materias-disponibles`): las bloqueadas por requisito muestran candado y lo que falta; las disponibles se agregan al **carrito** (clic o arrastre) con validacion de creditos 6-19 y cruce de horario en vivo; la confirmacion usa `POST /matriculas/lote` y devuelve el radicado.
- **Registro academico:** selector de periodos (los que tienen matriculas) y tabla por materia con creditos, calificacion, nota final y estado (`Cursando` si el periodo esta abierto; si no `Aprobada`/`Reprobada`/`Sin nota`), mas promedio del semestre, acumulado y situacion academica. Consulta `GET /estudiantes/{cedula}/matriculas?periodo=`.
- **Mis notas:** selectores **Materia** y **Periodo** (por defecto "Todas"/"Todos") que filtran las cifras, la tabla y la seccion **Calificaciones por actividad**, agrupada por materia (tipo, titulo, fecha y nota); una materia sin actividades muestra "Sin actividades calificadas en esta seleccion".
- **Mis tareas:** selectores **Materia** y **Periodo**; las cifras (tareas, entregadas, pendientes, no entrego) y la lista se filtran y se **agrupan por materia** cuando esta "Todas". Subida de entregas (`POST /tareas/{id}/entregas`) y descarga de archivos de apoyo.
- **Mis documentos:** recibo de matricula y boletin de notas en PDF (`GET /pdf/...`).

## 5. Profesor

Menu: **Ingresar notas · Tareas · Reportes**.

- **Ingresar notas:** elige una de **sus** materias; por estudiante matriculado hay sugerencia calculada (`GET /notas/sugerencias/{id_materia}`) y el formulario de las tres notas (`POST /notas/`).
- **Tareas:** crea tareas con tipo (taller/quiz/examen/trabajo), momento (1 a 3), fecha limite y archivo de apoyo; el selector **Materia** filtra la lista a una de sus materias; **Ver entregas** muestra quien entrego y quien no, descarga archivos y guarda calificaciones (`PUT .../calificacion` o `POST .../calificaciones` para quiz/examen sin archivo).
- **Reportes:** PDF de recibo y notas de sus estudiantes (`GET /pdf/...` con validacion de permisos).

## 6. Detalles transversales

- El menu se construye desde `MENUS[rol]` en `frontend/app.js`; ningun rol ve los formularios de otro.
- Animaciones de entrada suaves respetando `prefers-reduced-motion`.
- `frontend/config.js` apunta a `http://localhost:8000`; `frontend/servir.py` sirve la carpeta en el 5173.
- Credenciales de la API nunca en el codigo: el backend lee `backend/.env` (ver `docs/instalacion.md`).
