-- ==========================================
-- V10: horario estructurado de materias.
-- Agrega dia, hora_inicio y hora_fin a materias.
-- Las materias existentes quedan sin horario
-- (NULL) hasta que se carguen. No toca V1 a V9.
-- Idempotente: segura de correr varias veces.
-- ==========================================

ALTER TABLE materias ADD COLUMN IF NOT EXISTS dia VARCHAR(20);
ALTER TABLE materias ADD COLUMN IF NOT EXISTS hora_inicio TIME;
ALTER TABLE materias ADD COLUMN IF NOT EXISTS hora_fin TIME;
