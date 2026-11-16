-- ==========================================
-- V6: momento de evaluación de las tareas (1, 2 o 3).
-- Nullable a propósito: las tareas existentes quedan con momento NULL
-- y no se les asigna valor por defecto. Idempotente por si hay que
-- volver a aplicarla.
-- ==========================================

ALTER TABLE tareas ADD COLUMN IF NOT EXISTS momento SMALLINT;

ALTER TABLE tareas DROP CONSTRAINT IF EXISTS ck_tareas_momento;
ALTER TABLE tareas ADD CONSTRAINT ck_tareas_momento
    CHECK (momento IS NULL OR momento BETWEEN 1 AND 3);
