# Sistema de Matrícula Académica — UCC

Aplicación de escritorio en **Python** para gestionar matrículas, notas y reportes académicos, con **PostgreSQL** como base de datos. Proyecto académico de Ingeniería de Sistemas, Universidad Cooperativa de Colombia (UCC), Sede Cali.

> Empezó como un ejercicio de registro de biblioteca con Excel. Por pedido del profesor se convirtió en un sistema con login por roles, carrito de matrícula, módulo de notas, reportes en PDF y base de datos relacional.

---

## Funcionalidades

| Rol | Qué puede hacer |
|---|---|
| **Administrador** | Registrar facultades, programas, materias y estudiantes. Crear cuentas de estudiante y de profesor. Restablecer claves. |
| **Estudiante** | Matricular materias de su programa (carrito de compras) e imprimir su recibo de matrícula y su reporte de notas. |
| **Profesor** | Ingresar notas solo de sus materias e imprimir reportes de los estudiantes matriculados en ellas. |
| **Todos** | Cambiar su propia contraseña (pide la actual). |

### Reglas de negocio
- **Créditos por matrícula:** mínimo **6** y máximo **19**. El total se calcula mientras se arma el carrito.
- **Carrito:** el estudiante agrega varias materias, ve el horario de cada una y confirma al final. No puede agregar la misma materia dos veces.
- **Materias disponibles:** el estudiante solo ve las materias de la facultad a la que pertenece su programa.
- **Jerarquía de datos:** un estudiante pertenece a un programa, un programa pertenece a una facultad, y una materia pertenece a una facultad y tiene un profesor.
- **Notas:** 3 notas por materia, cada una entre `0.0` y `5.0`. La definitiva es el promedio. Es **Aprobado** con `>= 3.0`.
- **Notas protegidas:** el profesor elige una de sus materias y solo puede calificar a los estudiantes matriculados en ella.
- **Identidad en la sesión:** el estudiante no elige su cédula en ningún combo; el sistema usa la de su sesión.
- **Claves:** se guardan como hash con sal (PBKDF2-SHA256). Toda cuenta nueva recibe una clave temporal aleatoria de 8 caracteres y debe cambiarla al primer ingreso.

---

## Estructura del proyecto

```
MatriculaUniversitaria_v3/
├── main.py                 # Punto de entrada: ventana principal y menú según el rol
├── autenticacion.py        # Pantalla de login y cambio obligatorio de clave
├── formularios.py          # Ventanas: facultad, programa, materia, estudiante, matrícula, notas, PDF
├── gestion_usuarios.py     # Admin: crear cuentas de estudiante y profesor, restablecer claves
├── mi_cuenta.py            # Cualquier usuario: cambiar su propia clave
├── seguridad.py            # Generación de claves temporales, hash y verificación
├── db_postgres.py          # Acceso a datos: consultas, inserciones y actualizaciones
├── conexion.py             # Datos de conexión a PostgreSQL (a partir de conexion_ejemplo.py)
├── conexion_ejemplo.py     # Plantilla de conexión, sin claves reales
├── pdf_reportes.py         # Generación de PDFs (recibo de matrícula y reporte de notas)
├── logo_ucc.png            # Logo de la universidad
├── README.md
└── database/
    ├── crear_tablas.sql    # Crea las 8 tablas
    ├── poblar_datos.sql    # Carga datos de prueba
    └── respaldo_matricula.sql   # (opcional) Copia completa de la base de datos
```

Cada archivo tiene una responsabilidad clara: las ventanas no escriben SQL directamente, todo pasa por `db_postgres.py`.

---

## Modelo de datos

| Tabla | Columnas principales |
|---|---|
| **facultades** | `id_facultad` (PK), `nombre_facultad` |
| **programas** | `id_programa` (PK), `nombre_programa`, `id_facultad` (FK) |
| **profesores** | `id_profesor` (PK), `nombre`, `apellidos` |
| **materias** | `id_materia` (PK), `nombre_curso`, `creditos`, `cupos`, `id_facultad` (FK), `horario`, `id_profesor` (FK) |
| **estudiantes** | `id_estudiante` (PK, la cédula), `nombre`, `apellidos`, `correo`, `telefono`, `semestre`, `id_programa` (FK) |
| **matriculas** | `id_matricula` (PK), `cedula` (FK), `id_materia` (FK), `creditos`, `periodo`, `fecha_matricula`, `estado` |
| **notas** | `id_nota` (PK), `id_matricula` (FK), `id_materia` (FK), `nota1`, `nota2`, `nota3`, `definitiva`, `estado` |
| **usuarios** | `id_usuario` (PK), `usuario` (único), `sal`, `password_hash`, `rol`, `id_persona`, `debe_cambiar_clave` |

Relaciones principales:
`Facultad 1─N Programa 1─N Estudiante`, `Facultad 1─N Materia`, `Profesor 1─N Materia`, `Estudiante 1─N Matricula N─1 Materia`, `Matricula 1─1 Nota`.

Restricciones que cuida la base de datos: no se puede matricular la misma materia dos veces en el mismo periodo (`UNIQUE`), ni asignar una materia a un profesor o programa que no existe (llaves foráneas), ni poner notas fuera de `0.0`–`5.0` (`CHECK`).

---

## Instalación y uso

**Requisitos:** Python 3.10+ y PostgreSQL 17 o 18.

### 1. Instalar dependencias
```bash
pip install customtkinter pillow reportlab psycopg2-binary
```

### 2. Crear la base de datos
En pgAdmin, crea una base vacía (por ejemplo `Matricula`) y corre en este orden el contenido de:
1. `database/crear_tablas.sql`
2. `database/poblar_datos.sql` (opcional, carga datos de prueba)

### 3. Crear la cuenta de administrador
```bash
python crear_admin.py
```
Anota la clave temporal que se muestra en la terminal. Solo aparece una vez.

### 4. Configurar la conexión
Copia `conexion_ejemplo.py` y renombra la copia a `conexion.py`. Luego reemplaza `TU_BASE_DE_DATOS` y `TU_CONTRASEÑA` con tus datos de PostgreSQL, y ajusta `port` si usas otro puerto (5432 por defecto).

### 5. Ejecutar
```bash
python main.py
```
Entra como `admin` con la clave temporal. El sistema te pedirá cambiarla antes de mostrar el menú.

---

## Flujo de prueba

1. **Admin:** registra un programa y una materia para él. Usa **Cuenta Estudiante** y **Cuenta Profesor** para crear sus cuentas. Entrega las claves temporales.
2. **Estudiante:** entra con su cédula como usuario, cambia su clave y abre **Matricular Materia**. Agrega materias de su programa y guarda.
3. **Profesor:** entra, cambia su clave, abre **Ingresar Notas**, elige una de sus materias y un estudiante matriculado, y registra las 3 notas.
4. **Reportes:** el estudiante imprime su recibo o sus notas. El profesor imprime el reporte de notas de sus estudiantes. Los PDF se guardan en la carpeta del proyecto como `Recibo_Matricula_<cedula>.pdf` y `Reporte_Notas_<cedula>.pdf`.

Si olvidan una clave, el admin usa **Restablecer Clave** y genera una nueva temporal.

---

## Tecnologías

- **Python**: lenguaje principal
- **CustomTkinter** y **Pillow**: interfaz gráfica e imágenes
- **PostgreSQL** con **psycopg2**: base de datos relacional
- **hashlib** y **hmac** (librería estándar): hash de claves con PBKDF2 y sal
- **ReportLab** (Platypus): generación de PDFs

---

## Limitaciones conocidas

Este proyecto es académico y estas limitaciones están documentadas a propósito:

- **Credenciales de conexión:** `conexion.py` contiene la clave de PostgreSQL en texto plano. Para un entorno real iría en variables de entorno.
- **Filtro por facultad:** las materias disponibles para un estudiante se filtran por facultad, no por programa. Dos programas de la misma facultad ven las mismas materias.
- **Cupos:** el campo `cupos` se guarda, pero no se descuenta al matricular ni se valida que la materia esté llena.
- **Cruces de horario:** el carrito muestra el horario de cada materia, pero no bloquea dos materias a la misma hora.
- **Notas:** no hay edición de notas existentes. Una vez registradas, no se pueden cambiar desde la interfaz.
- **Restablecer clave:** solo lo puede hacer el administrador. El usuario no puede recuperar su clave por su cuenta.
- **Límite de intentos de login:** no existe. Un bloqueo real necesitaría guardar los intentos en la base de datos.

---

## Autor

**Santiago Patiño Ríos**: Ingeniería de Sistemas, Universidad Cooperativa de Colombia, Sede Cali.