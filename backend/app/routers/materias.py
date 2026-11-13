# ==========================================
# ARCHIVO: routers/materias.py
# FUNCIÓN: Endpoints CRUD de materias (GET y POST).
# ==========================================

from typing import Optional

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

try:
    from app.database import obtener_conexion
    from app.seguridad_api import require_admin
except ImportError:
    from database import obtener_conexion
    from seguridad_api import require_admin

router = APIRouter(prefix="/materias", tags=["materias"])


class MateriaCreate(BaseModel):
    id_materia: str = Field(..., min_length=1)
    nombre_curso: str = Field(..., min_length=1)
    creditos: int = Field(..., gt=0)
    cupos: int = Field(default=20, ge=0)
    id_facultad: str = Field(..., min_length=1)
    horario: Optional[str] = None
    id_profesor: str = Field(..., min_length=1)


@router.get("/", status_code=status.HTTP_200_OK)
def listar_materias():
    """Devuelve todas las materias ordenadas por ID."""
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id_materia, nombre_curso, creditos, cupos, id_facultad, horario, id_profesor "
                "FROM materias ORDER BY id_materia"
            )
            filas = cur.fetchall()
        return [
            {
                "id_materia": id_materia,
                "nombre_curso": nombre_curso,
                "creditos": creditos,
                "cupos": cupos,
                "id_facultad": id_facultad,
                "horario": horario,
                "id_profesor": id_profesor,
            }
            for id_materia, nombre_curso, creditos, cupos, id_facultad, horario, id_profesor in filas
        ]
    finally:
        conn.close()


@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_materia(materia: MateriaCreate, _admin: dict = Depends(require_admin)):
    """Crea una materia. Devuelve 409 si el ID ya existe y 404 si la facultad o el profesor no existen."""
    id_materia = materia.id_materia.strip()
    nombre_curso = materia.nombre_curso.strip()
    id_facultad = materia.id_facultad.strip()
    id_profesor = materia.id_profesor.strip()
    horario = materia.horario.strip() if materia.horario else None
    if horario == "":
        horario = None

    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM materias WHERE id_materia = %s",
                (id_materia,),
            )
            if cur.fetchone() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Ya existe una materia con ID '{id_materia}'",
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
            cur.execute(
                "SELECT 1 FROM profesores WHERE id_profesor = %s",
                (id_profesor,),
            )
            if cur.fetchone() is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe el profesor con ID '{id_profesor}'",
                )
            try:
                cur.execute(
                    "INSERT INTO materias (id_materia, nombre_curso, creditos, cupos, id_facultad, horario, id_profesor) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (
                        id_materia,
                        nombre_curso,
                        materia.creditos,
                        materia.cupos,
                        id_facultad,
                        horario,
                        id_profesor,
                    ),
                )
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Ya existe una materia con ID '{id_materia}'",
                )
            except psycopg2.errors.ForeignKeyViolation:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la facultad con ID '{id_facultad}' o el profesor con ID '{id_profesor}'",
                )
        conn.commit()
        return {
            "id_materia": id_materia,
            "nombre_curso": nombre_curso,
            "creditos": materia.creditos,
            "cupos": materia.cupos,
            "id_facultad": id_facultad,
            "horario": horario,
            "id_profesor": id_profesor,
        }
    finally:
        conn.close()
