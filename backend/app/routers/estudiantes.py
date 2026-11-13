# ==========================================
# ARCHIVO: routers/estudiantes.py
# FUNCIÓN: Endpoints CRUD de estudiantes (GET y POST).
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

router = APIRouter(prefix="/estudiantes", tags=["estudiantes"])


class EstudianteCreate(BaseModel):
    id_estudiante: str = Field(..., min_length=1)
    nombre: str = Field(..., min_length=1)
    apellidos: str = Field(..., min_length=1)
    correo: str = Field(..., min_length=1, pattern=r".+@.+")
    telefono: Optional[str] = None
    semestre: int = Field(..., gt=0)
    id_programa: str = Field(..., min_length=1)


@router.get("/", status_code=status.HTTP_200_OK)
def listar_estudiantes():
    """Devuelve todos los estudiantes ordenados por ID."""
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id_estudiante, nombre, apellidos, correo, telefono, semestre, id_programa "
                "FROM estudiantes ORDER BY id_estudiante"
            )
            filas = cur.fetchall()
        return [
            {
                "id_estudiante": id_estudiante,
                "nombre": nombre,
                "apellidos": apellidos,
                "correo": correo,
                "telefono": telefono,
                "semestre": semestre,
                "id_programa": id_programa,
            }
            for id_estudiante, nombre, apellidos, correo, telefono, semestre, id_programa in filas
        ]
    finally:
        conn.close()


@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_estudiante(estudiante: EstudianteCreate, _admin: dict = Depends(require_admin)):
    """Crea un estudiante. Devuelve 409 si el ID ya existe y 404 si el programa no existe."""
    id_estudiante = estudiante.id_estudiante.strip()
    nombre = estudiante.nombre.strip()
    apellidos = estudiante.apellidos.strip()
    correo = estudiante.correo.strip()
    telefono = estudiante.telefono.strip() if estudiante.telefono else None
    if telefono == "":
        telefono = None
    id_programa = estudiante.id_programa.strip()

    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM estudiantes WHERE id_estudiante = %s",
                (id_estudiante,),
            )
            if cur.fetchone() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Ya existe un estudiante con ID '{id_estudiante}'",
                )
            cur.execute(
                "SELECT 1 FROM programas WHERE id_programa = %s",
                (id_programa,),
            )
            if cur.fetchone() is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe el programa con ID '{id_programa}'",
                )
            try:
                cur.execute(
                    "INSERT INTO estudiantes (id_estudiante, nombre, apellidos, correo, telefono, semestre, id_programa) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (
                        id_estudiante,
                        nombre,
                        apellidos,
                        correo,
                        telefono,
                        estudiante.semestre,
                        id_programa,
                    ),
                )
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Ya existe un estudiante con ID '{id_estudiante}'",
                )
            except psycopg2.errors.ForeignKeyViolation:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe el programa con ID '{id_programa}'",
                )
        conn.commit()
        return {
            "id_estudiante": id_estudiante,
            "nombre": nombre,
            "apellidos": apellidos,
            "correo": correo,
            "telefono": telefono,
            "semestre": estudiante.semestre,
            "id_programa": id_programa,
        }
    finally:
        conn.close()
