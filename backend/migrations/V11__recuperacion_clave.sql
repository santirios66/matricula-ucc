-- ==========================================
-- V11: token temporal para recuperar la clave por correo.
-- reset_token guarda el SHA-256 del token (nunca el token en claro) y
-- reset_expira la fecha limite del codigo (15 minutos tras solicitarlo).
-- Ambas columnas son nullable para no tocar las cuentas existentes.
-- Idempotente: segura de correr varias veces.
-- ==========================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token VARCHAR(64);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_expira TIMESTAMP;
