# Limitaciones del sistema

Lo que el sistema **no** hace, segun el codigo y la documentacion. Es un proyecto academico: varias de estas decisiones son a proposito y estan aqui para no vender humo.

## Seguridad

- **Sin HTTPS ni tokens:** la clave viaja en el encabezado `X-Clave` en texto plano en cada peticion (solo HTTP local). No hay JWT ni sesiones en servidor: cada request re-autentica.
- **Sin limite de intentos de login:** no hay bloqueo por fuerza bruta (habria que persistir intentos en la base).
- **Credenciales de PostgreSQL en archivos locales:** `backend/.env` (y el `conexion.py` del legado de escritorio) guardan la clave en texto plano. Estan en `.gitignore` y no se publican, pero cualquiera con acceso a la maquina las lee. **Pendiente: no existe `backend/.env.example`** para facilitar la configuracion sin copiar credenciales de otra persona.
- **Recuperacion de clave solo por admin:** el usuario no puede recuperarla solo; `POST /auth/restablecer-clave` exige credenciales de administrador.
- **CORS restringido a `http://localhost:5173`:** pensado para desarrollo local de una sola maquina; no hay despliegue ni dominios configurables.

## Notas

- **Las notas no se editan ni se borran:** no existe `PUT`/`DELETE` en `/notas/`; un error obliga a compensar por base de datos.
- **Convivencia calculada/manual:** una matricula sin nota a mano muestra N1/N2/N3 calculadas desde tareas; si el profesor luego registra la nota a mano, esa pasa a ser la definitiva. No hay marcado de "nota oficial" frente a la calculada mas alla del campo `calculada: true/false` del GET.
- **Redondeo:** la definitiva se calcula con `round(..., 2)` y la columna es `NUMERIC(3,2)`.

## Matricula

- **DELETE deja la cabecera huerfana:** `DELETE /matriculas/{id}` borra notas y filas de matricula, pero no limpia la fila de `matriculas_lote`; el radicado queda sin filas asociadas.
- **Cupos sin descuento:** la disponibilidad se calcula con `COUNT` de matriculados contra `materias.cupos`; no hay columna de cupos restantes ni aviso de "quedan N".
- **Periodos huerfanos:** matriculas cuyo `periodo` no existe en la tabla `periodos` (datos antiguos) no tienen historial consultable; el Registro academico las lista con un aviso de "periodo no configurado" en lugar de datos.
- **Materias fuera del plan en matriculas viejas:** las reglas de plan/requisitos aplican al crear o editar; las filas historicas no se auditan hacia atras.
- **Radical solo del lote:** las matriculas creadas con `POST /matriculas/` (unitario) no generan cabecera ni radicado (`matriculas.id_lote` es nullable por V9); el recibo lo avisa.

## Tareas y archivos

- **Archivos en disco local:** los apoyos y entregas se guardan en `backend/archivos/` (ignorado por git), sin almacenamiento externo ni antivirus; limite de 20 MB por archivo (PDF/MP4/WebM).
- **La entrega mas reciente cuenta:** no hay historial de intentos visible para el profesor en la UI (la API conserva las filas, pero solo la ultima se usa).
- **PDFs generados a demanda** en la carpeta del backend (quedan como archivos sueltos; `*.pdf` esta en `.gitignore`).

## Frontend

- **Sin framework ni tests automatizados:** JavaScript puro sin build; las "pruebas" son suites manuales documentadas en `docs/pruebas_*.md`. No hay CI ni regresion automatica (pendiente).
- **Estado en memoria:** la sesion y los filtros se pierden al recargar (decision de seguridad: nada en `localStorage`/`sessionStorage`/cookies).
- **Catalogos sin paginacion:** los listados cargan todo y filtran en el cliente; con muchos registros la tabla crece sin limite.
- **Mis tareas solo muestra el periodo vigente:** el endpoint `/tareas/` del estudiante solo devuelve tareas de matriculas activas en periodos abiertos, asi que el filtro de periodo no tiene efecto entre periodos pasados.
- **Semestre del estudiante manual:** no avanza automaticamente al terminar un periodo.

## Legado

- **`escritorio/` no se mantiene:** la app Tkinter original queda como referencia; su `conexion.py` local tiene credenciales en texto plano (gitignored) y la documentacion de instalacion no la cubre.
- **`backend/app` mezcla epocas:** `db_postgres.py`, `seguridad.py` y `conexion_ejemplo.py` son del legado pero la API actual los reutiliza (`auth.py` importa de ellos); no son codigo muerto, pero tampoco una separacion limpia.
