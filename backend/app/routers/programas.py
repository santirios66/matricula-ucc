# ==========================================
# ARCHIVO: routers/programas.py
# FUNCIÓN: Endpoints CRUD de programas (GET y POST).
# ==========================================

import psycopg2
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

try:
    from app.database import obtener_conexion
except ImportError:
    from database import obtener_conexion

router = APIRouter(prefix="/programas", tags=["programas"])


class ProgramaCreate(BaseModel):
    id_programa: str = Field(..., min_length=1)
    nombre_programa: str = Field(..., min_length=1)
    id_facultad: str = Field(..., min_length=1)


@router.get("/", status_code=status.HTTP_200_OK)
def listar_programas():
    """Devuelve todos los programas ordenados por ID."""
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id_programa, nombre_programa, id_facultad FROM programas ORDER BY id_programa"
            )
            filas = cur.fetchall()
        return [
            {
                "id_programa": id_programa,
                "nombre_programa": nombre_programa,
                "id_facultad": id_facultad,
            }
            for id_programa, nombre_programa, id_facultad in filas
        ]
    finally:
        conn.close()


@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_programa(programa: ProgramaCreate):
    """Crea un programa. Devuelve 409 si el ID ya existe y 404 si la facultad no existe."""
    id_programa = programa.id_programa.strip()
    nombre_programa = programa.nombre_programa.strip()
    id_facultad = programa.id_facultad.strip()

    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM programas WHERE id_programa = %s",
                (id_programa,),
            )
            if cur.fetchone() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Ya existe un programa con ID '{id_programa}'",
                )
            cur.execute(
                "SELECT 1 FROM facultades WHERE id_facultad = %s",
                (id_facultad,),
            )
            if cur.fetchone() is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la facultad con ID '{id_facultad}'",
                )
            try:
                cur.execute(
                    "INSERT INTO programas (id_programa, nombre_programa, id_facultad) VALUES (%s, %s, %s)",
                    (id_programa, nombre_programa, id_facultad),
                )
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Ya existe un programa con ID '{id_programa}'",
                )
            except psycopg2.errors.ForeignKeyViolation:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la facultad con ID '{id_facultad}'",
                )
        conn.commit()
        return {
            "id_programa": id_programa,
            "nombre_programa": nombre_programa,
            "id_facultad": id_facultad,
        }
    finally:
        conn.close()
