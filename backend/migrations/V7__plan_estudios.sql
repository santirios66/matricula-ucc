-- ==========================================
-- V7: plan de estudios por programa.
-- plan_estudios define qué materias componen el plan de cada programa,
-- con semestre (1 a 10) y si es obligatoria. Una materia puede estar en
-- varios programas (las materias base compartidas).
-- Además, programas.plan_referencia marca los planes de demostración.
-- Idempotente: segura de correr varias veces. No toca V1 a V6.
-- ==========================================

CREATE TABLE IF NOT EXISTS plan_estudios (
    id_programa  VARCHAR(10) NOT NULL REFERENCES programas(id_programa),
    id_materia   VARCHAR(10) NOT NULL REFERENCES materias(id_materia),
    semestre     INT         NOT NULL CHECK (semestre BETWEEN 1 AND 10),
    obligatoria  BOOLEAN     NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id_programa, id_materia)
);

ALTER TABLE programas ADD COLUMN IF NOT EXISTS plan_referencia BOOLEAN NOT NULL DEFAULT TRUE;
