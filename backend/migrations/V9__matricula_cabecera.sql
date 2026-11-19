-- ==========================================
-- V9: cabecera de matrícula (lote) con radicado único.
-- Cada petición del lote (POST /matriculas/lote) crea una fila en
-- matriculas_lote con su radicado (8 caracteres en mayúsculas, único) y
-- todas las materias de ese carrito quedan apuntando a la cabecera vía
-- matriculas.id_lote. La columna es nullable para no romper las matrículas
-- anteriores a esta migración (quedan sin lote y el recibo lo avisa).
-- Idempotente: segura de correr varias veces. No toca V1 a V8.
-- ==========================================

CREATE TABLE IF NOT EXISTS matriculas_lote (
    id_lote   VARCHAR(20) PRIMARY KEY,
    radicado  VARCHAR(8)  NOT NULL UNIQUE CHECK (LENGTH(radicado) = 8 AND radicado = UPPER(radicado)),
    cedula    VARCHAR(20) NOT NULL REFERENCES estudiantes(id_estudiante),
    periodo   VARCHAR(10) NOT NULL REFERENCES periodos(periodo),
    fecha     TIMESTAMP   NOT NULL DEFAULT NOW(),
    estado    VARCHAR(20) NOT NULL DEFAULT 'Activa'
);

ALTER TABLE matriculas ADD COLUMN IF NOT EXISTS id_lote VARCHAR(20) REFERENCES matriculas_lote(id_lote);
