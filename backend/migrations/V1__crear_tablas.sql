-- ==========================================================
-- ARCHIVO: crear_tablas.sql
-- FUNCION: Crea todas las tablas del Sistema de Matricula en PostgreSQL.
-- Es seguro correrlo varias veces: no borra ni cambia tablas que ya existan.
-- Orden: primero las tablas que no dependen de nadie, al final las que dependen de otras.
-- ==========================================================

-- 1) Facultades
CREATE TABLE IF NOT EXISTS facultades (
    id_facultad      VARCHAR(10)  PRIMARY KEY,
    nombre_facultad  VARCHAR(100) NOT NULL
);

-- 2) Programas (cada programa pertenece a una facultad)
CREATE TABLE IF NOT EXISTS programas (
    id_programa      VARCHAR(10)  PRIMARY KEY,
    nombre_programa  VARCHAR(100) NOT NULL,
    id_facultad      VARCHAR(10)  NOT NULL REFERENCES facultades(id_facultad)
);

-- 3) Profesores (cada profesor tiene su propia cuenta de usuario)
CREATE TABLE IF NOT EXISTS profesores (
    id_profesor  VARCHAR(20)  PRIMARY KEY,
    nombre       VARCHAR(60)  NOT NULL,
    apellidos    VARCHAR(60)  NOT NULL
);

-- 4) Materias (pertenecen a una facultad y tienen un profesor)
CREATE TABLE IF NOT EXISTS materias (
    id_materia    VARCHAR(10)  PRIMARY KEY,
    nombre_curso  VARCHAR(100) NOT NULL,
    creditos      INT          NOT NULL CHECK (creditos > 0),
    cupos         INT          NOT NULL DEFAULT 20 CHECK (cupos >= 0),
    id_facultad   VARCHAR(10)  NOT NULL REFERENCES facultades(id_facultad),
    horario       VARCHAR(100),
    id_profesor   VARCHAR(20)  REFERENCES profesores(id_profesor)
);

-- Si la tabla materias ya existia de una version anterior, estas dos lineas la ponen al dia.
-- Si ya estan al dia, no hacen nada.
ALTER TABLE materias ADD COLUMN IF NOT EXISTS id_profesor VARCHAR(20) REFERENCES profesores(id_profesor);
ALTER TABLE materias DROP COLUMN IF EXISTS docente;

-- 5) Estudiantes (el ID es la cedula)
CREATE TABLE IF NOT EXISTS estudiantes (
    id_estudiante  VARCHAR(20)  PRIMARY KEY,
    nombre         VARCHAR(60)  NOT NULL,
    apellidos      VARCHAR(60)  NOT NULL,
    correo         VARCHAR(100) NOT NULL,
    telefono       VARCHAR(20),
    semestre       INT          NOT NULL CHECK (semestre > 0),
    id_programa    VARCHAR(10)  NOT NULL REFERENCES programas(id_programa)
);

-- 6) Matriculas (una fila por materia matriculada por un estudiante en un periodo)
CREATE TABLE IF NOT EXISTS matriculas (
    id_matricula     VARCHAR(20) PRIMARY KEY,
    cedula           VARCHAR(20) NOT NULL REFERENCES estudiantes(id_estudiante),
    id_materia       VARCHAR(10) NOT NULL REFERENCES materias(id_materia),
    creditos         INT         NOT NULL CHECK (creditos > 0),
    periodo          VARCHAR(10) NOT NULL,
    fecha_matricula  DATE        NOT NULL DEFAULT CURRENT_DATE,
    estado           VARCHAR(20) NOT NULL DEFAULT 'Activa',
    UNIQUE (cedula, id_materia, periodo)
);

-- 7) Notas (una fila por matricula calificada)
CREATE TABLE IF NOT EXISTS notas (
    id_nota       VARCHAR(20)  PRIMARY KEY,
    id_matricula  VARCHAR(20)  NOT NULL REFERENCES matriculas(id_matricula),
    id_materia    VARCHAR(10)  NOT NULL REFERENCES materias(id_materia),
    nota1         NUMERIC(3,2) CHECK (nota1 BETWEEN 0 AND 5),
    nota2         NUMERIC(3,2) CHECK (nota2 BETWEEN 0 AND 5),
    nota3         NUMERIC(3,2) CHECK (nota3 BETWEEN 0 AND 5),
    definitiva    NUMERIC(3,2) CHECK (definitiva BETWEEN 0 AND 5),
    estado        VARCHAR(20)
);

-- 8) Usuarios (cuentas de login; la clave se guarda como hash + sal, nunca en texto)
--    id_persona: cedula si es estudiante, ID del profesor si es profesor, NULL si es admin.
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario         SERIAL PRIMARY KEY,
    usuario            VARCHAR(30)  NOT NULL UNIQUE,
    sal                VARCHAR(64)  NOT NULL,
    password_hash      VARCHAR(128) NOT NULL,
    rol                VARCHAR(20)  NOT NULL CHECK (rol IN ('Administrador', 'Profesor', 'Estudiante')),
    id_persona         VARCHAR(20),
    debe_cambiar_clave BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Nota: la cuenta admin NO se crea con SQL, porque su clave necesita el hash de seguridad.
-- Se crea con:  python crear_admin.py