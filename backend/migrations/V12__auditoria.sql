-- ==========================================
-- V12: campos de auditoria en tablas de catalogo.
-- Agrega creado_por (quien registro la fila) y creado_en (cuando)
-- a las tablas que maneja el admin. Nullable para no romper
-- las filas existentes.
-- Idempotente: segura de correr varias veces.
-- ==========================================

-- Facultades
ALTER TABLE facultades ADD COLUMN IF NOT EXISTS creado_por VARCHAR(30);
ALTER TABLE facultades ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP DEFAULT NOW();

-- Programas
ALTER TABLE programas ADD COLUMN IF NOT EXISTS creado_por VARCHAR(30);
ALTER TABLE programas ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP DEFAULT NOW();

-- Profesores
ALTER TABLE profesores ADD COLUMN IF NOT EXISTS creado_por VARCHAR(30);
ALTER TABLE profesores ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP DEFAULT NOW();

-- Estudiantes
ALTER TABLE estudiantes ADD COLUMN IF NOT EXISTS creado_por VARCHAR(30);
ALTER TABLE estudiantes ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP DEFAULT NOW();

-- Periodos
ALTER TABLE periodos ADD COLUMN IF NOT EXISTS creado_por VARCHAR(30);
ALTER TABLE periodos ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP DEFAULT NOW();

-- Plan de estudios
ALTER TABLE plan_estudios ADD COLUMN IF NOT EXISTS creado_por VARCHAR(30);
ALTER TABLE plan_estudios ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP DEFAULT NOW();

-- Matriculas (quien confirmo la matricula: el estudiante o el admin)
ALTER TABLE matriculas ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMP DEFAULT NOW();

-- Notas (quien registro la nota: el profesor o el admin)
ALTER TABLE notas ADD COLUMN IF NOT EXISTS creado_por VARCHAR(30);
ALTER TABLE notas ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP DEFAULT NOW();
