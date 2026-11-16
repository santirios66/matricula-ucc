-- ==========================================================
-- ARCHIVO: V5__tipo_tarea.sql
-- FUNCION: Tipo de actividad de cada tarea (taller, quiz,
-- examen o trabajo) y calificación de las entregas (0.0 a 5.0).
-- Para "examen" y "quiz" el archivo de la entrega es opcional:
-- la actividad se califica directamente.
-- Es seguro correrlo varias veces: no borra ni cambia tablas.
-- Aplicar DESPUES de V1, V2, V3 y V4 (pgAdmin -> Query Tool).
-- ==========================================================

-- 1) Tipo de la actividad. Las tareas creadas antes de V5
--    quedan como 'taller' (el valor por defecto).
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'taller';

ALTER TABLE tareas DROP CONSTRAINT IF EXISTS chk_tareas_tipo;
ALTER TABLE tareas ADD CONSTRAINT chk_tareas_tipo
    CHECK (tipo IN ('taller', 'quiz', 'examen', 'trabajo'));

-- 2) Calificación de la entrega: opcional, entre 0.0 y 5.0.
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS calificacion NUMERIC(3,2);

ALTER TABLE entregas DROP CONSTRAINT IF EXISTS chk_entregas_calificacion;
ALTER TABLE entregas ADD CONSTRAINT chk_entregas_calificacion
    CHECK (calificacion IS NULL OR (calificacion >= 0.0 AND calificacion <= 5.0));
