-- ==========================================================
-- ARCHIVO: V4__tareas.sql
-- FUNCION: Tablas de tareas del profesor y entregas del estudiante.
-- Cada materia puede tener varias tareas; un estudiante puede subir
-- varias entregas de la misma tarea (cuenta la mas reciente).
-- Es seguro correrlo varias veces: no borra ni cambia tablas existentes.
-- Aplicar DESPUES de V1, V2 y V3 (pgAdmin -> Query Tool, en orden).
-- ==========================================================

-- 1) Tareas (una fila por tarea creada por un profesor en una materia)
CREATE TABLE IF NOT EXISTS tareas (
    id_tarea      VARCHAR(20)  PRIMARY KEY,
    id_materia    VARCHAR(10)  NOT NULL REFERENCES materias(id_materia),
    titulo        VARCHAR(120) NOT NULL,
    descripcion   TEXT         NOT NULL,
    fecha_limite  TIMESTAMP    NOT NULL,
    archivo_apoyo VARCHAR(255),
    creada_por    VARCHAR(20)  REFERENCES profesores(id_profesor),
    creada_en     TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- 2) Entregas (una fila por archivo subido por un estudiante a una tarea)
CREATE TABLE IF NOT EXISTS entregas (
    id_entrega  VARCHAR(20)  PRIMARY KEY,
    id_tarea    VARCHAR(20)  NOT NULL REFERENCES tareas(id_tarea),
    cedula      VARCHAR(20)  NOT NULL REFERENCES estudiantes(id_estudiante),
    archivo     VARCHAR(255) NOT NULL,
    comentario  TEXT,
    subida_en   TIMESTAMP    NOT NULL DEFAULT NOW()
);
