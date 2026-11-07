# ==========================================
# ARCHIVO: routers/facultades.py
# FUNCIÓN: Endpoints CRUD de facultades (GET y POST).
# ==========================================

import psycopg2
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

try:
    from app.database import obtener_conexion
except ImportError:
    from database import obtener_conexion

router = APIRouter(prefix="/facultades", tags=["facultades"])


class FacultadCreate(BaseModel):
    id_facultad: str = Field(..., min_length=1)
    nombre_facultad: str = Field(..., min_length=1)


@router.get("/", status_code=status.HTTP_200_OK)
def listar_facultades():
    """Devuelve todas las facultades ordenadas por ID."""
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id_facultad, nombre_facultad FROM facultades ORDER BY id_facultad"
            )
            filas = cur.fetchall()
        return [
            {"id_facultad": id_facultad, "nombre_facultad": nombre_facultad}
            for id_facultad, nombre_facultad in filas
        ]
    finally:
        conn.close()


@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_facultad(facultad: FacultadCreate):
    """Crea una facultad. Devuelve 409 si el ID ya existe."""
    id_facultad = facultad.id_facultad.strip()
    nombre_facultad = facultad.nombre_facultad.strip()

    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM facultades WHERE id_facultad = %s",
                (id_facultad,),
            )
            if cur.fetchone() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Ya existe una facultad con ID '{id_facultad}'",
                )
            try:
                cur.execute(
                    "INSERT INTO facultades (id_facultad, nombre_facultad) VALUES (%s, %s)",
                    (id_facultad, nombre_facultad),
                )
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Ya existe una facultad con ID '{id_facultad}'",
                )
        conn.commit()
        return {"id_facultad": id_facultad, "nombre_facultad": nombre_facultad}
    finally:
        conn.close()
