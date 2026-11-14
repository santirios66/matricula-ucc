# ==========================================
# ARCHIVO: routers/periodos.py
# FUNCIÓN: Creación y consulta de periodos de matrícula.
# Solo el administrador crea periodos; la consulta es pública.
# ==========================================

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

try:
    from app.database import obtener_conexion
    from app.seguridad_api import require_admin
except ImportError:
    from database import obtener_conexion
    from seguridad_api import require_admin

router = APIRouter(prefix="/periodos", tags=["periodos"])


class PeriodoCreate(BaseModel):
    periodo: str = Field(..., min_length=1)
    fecha_inicio: str = Field(..., min_length=1)
    fecha_fin: str = Field(..., min_length=1)


@router.get("/", status_code=status.HTTP_200_OK)
def listar_periodos():
    """Devuelve los periodos ordenados por código."""
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT periodo, fecha_inicio, fecha_fin FROM periodos ORDER BY periodo"
            )
            filas = cur.fetchall()
        return [
            {"periodo": periodo, "fecha_inicio": fecha_inicio, "fecha_fin": fecha_fin}
            for periodo, fecha_inicio, fecha_fin in filas
        ]
    finally:
        conn.close()


@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_periodo(periodo: PeriodoCreate, _admin: dict = Depends(require_admin)):
    """Crea un periodo de matrícula. Solo Administrador (403 si no)."""
    codigo = periodo.periodo.strip()
    try:
        conn = obtener_conexion()
        try:
            with conn.cursor() as cur:
                try:
                    cur.execute(
                        "INSERT INTO periodos (periodo, fecha_inicio, fecha_fin) VALUES (%s, %s, %s)",
                        (codigo, periodo.fecha_inicio, periodo.fecha_fin),
                    )
                except psycopg2.errors.UniqueViolation:
                    conn.rollback()
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Ya existe el periodo '{codigo}'",
                    )
                except psycopg2.errors.CheckViolation:
                    conn.rollback()
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="La fecha de inicio debe ser anterior o igual a la fecha de fin",
                    )
            conn.commit()
            return {
                "periodo": codigo,
                "fecha_inicio": periodo.fecha_inicio,
                "fecha_fin": periodo.fecha_fin,
            }
        finally:
            conn.close()
    except (ValueError, psycopg2.errors.InvalidTextRepresentation):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Las fechas deben tener formato YYYY-MM-DD",
        )
