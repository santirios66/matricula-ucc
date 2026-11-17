-- ==========================================
-- V8: requisitos previos por materia.
-- requisitos define qué materias hay que tener aprobadas (definitiva >= 3.0)
-- antes de poder matricular otra. La clave primaria es compuesta
-- (id_materia, id_requisito): una materia puede tener varios requisitos y
-- una materia puede ser requisito de varias. Una materia no puede ser
-- requisito de sí misma.
-- Idempotente: segura de correr varias veces. No toca V1 a V7.
-- ==========================================

CREATE TABLE IF NOT EXISTS requisitos (
    id_materia   VARCHAR(10) NOT NULL REFERENCES materias(id_materia),
    id_requisito VARCHAR(10) NOT NULL REFERENCES materias(id_materia),
    PRIMARY KEY (id_materia, id_requisito),
    CONSTRAINT requisitos_distinta_check CHECK (id_materia <> id_requisito)
);
