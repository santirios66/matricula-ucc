-- ==========================================================
-- ARCHIVO: V3__periodos.sql
-- FUNCION: Tabla de periodos de matrícula con rango de fechas.
-- Solo el administrador puede crear o cambiar periodos (POST /periodos/).
-- Es seguro correrlo varias veces: no borra ni cambia tablas existentes.
-- ==========================================================

CREATE TABLE IF NOT EXISTS periodos (
    periodo      VARCHAR(10) PRIMARY KEY,
    fecha_inicio DATE NOT NULL,
    fecha_fin    DATE NOT NULL,
    CHECK (fecha_inicio <= fecha_fin)
);

-- Periodo de matrícula 2026-2, con rango amplio que incluye la fecha actual.
INSERT INTO periodos (periodo, fecha_inicio, fecha_fin)
VALUES ('2026-2', DATE '2026-11-01', DATE '2026-12-20')
ON CONFLICT (periodo) DO NOTHING;
