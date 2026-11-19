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
    dia: Optional[str] = None
    hora_inicio: Optional[str] = None
    hora_fin: Optional[str] = None
    id_profesor: str = Field(..., min_length=1)


@router.get("/", status_code=status.HTTP_200_OK)
def listar_materias():
    """Devuelve todas las materias ordenadas por ID."""
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id_materia, nombre_curso, creditos, cupos, id_facultad, horario, id_profesor, "
                "dia, hora_inicio, hora_fin "
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
                "dia": dia,
                "hora_inicio": hora_inicio,
                "hora_fin": hora_fin,
            }
            for id_materia, nombre_curso, creditos, cupos, id_facultad, horario, id_profesor, dia, hora_inicio, hora_fin in filas
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
    dia = materia.dia.strip() if materia.dia else None
    hora_inicio = materia.hora_inicio
    hora_fin = materia.hora_fin

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
                    "INSERT INTO materias (id_materia, nombre_curso, creditos, cupos, id_facultad, horario, id_profesor, dia, hora_inicio, hora_fin) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (
                        id_materia,
                        nombre_curso,
                        materia.creditos,
                        materia.cupos,
                        id_facultad,
                        horario,
                        id_profesor,
                        dia,
                        hora_inicio,
                        hora_fin,
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
            "dia": dia,
            "hora_inicio": hora_inicio,
            "hora_fin": hora_fin,
        }
    finally:
        conn.close()


@router.put("/{id_materia}", status_code=status.HTTP_200_OK)
def editar_materia(
    id_materia: str,
    materia: MateriaCreate,
    _admin: dict = Depends(require_admin),
):
    """Edita una materia existente. 404 si no existe la materia."""
    id_materia = id_materia.strip()
    nombre_curso = materia.nombre_curso.strip()
    id_facultad = materia.id_facultad.strip()
    id_profesor = materia.id_profesor.strip()
    horario = materia.horario.strip() if materia.horario else None
    if horario == "":
        horario = None
    dia = materia.dia.strip() if materia.dia else None
    hora_inicio = materia.hora_inicio
    hora_fin = materia.hora_fin

    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM materias WHERE id_materia = %s",
                (id_materia,),
            )
            if cur.fetchone() is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la materia con ID '{id_materia}'",
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
                    "UPDATE materias SET nombre_curso = %s, creditos = %s, cupos = %s, "
                    "id_facultad = %s, horario = %s, id_profesor = %s, dia = %s, "
                    "hora_inicio = %s, hora_fin = %s WHERE id_materia = %s",
                    (
                        nombre_curso,
                        materia.creditos,
                        materia.cupos,
                        id_facultad,
                        horario,
                        id_profesor,
                        dia,
                        hora_inicio,
                        hora_fin,
                        id_materia,
                    ),
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
            "dia": dia,
            "hora_inicio": hora_inicio,
            "hora_fin": hora_fin,
        }
    finally:
        conn.close()


@router.delete("/{id_materia}", status_code=status.HTTP_200_OK)
def eliminar_materia(
    id_materia: str,
    _admin: dict = Depends(require_admin),
):
    """Elimina una materia. 404 si no existe; 409 si está referenciada (plan, matrículas, etc.)."""
    id_materia = id_materia.strip()
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT nombre_curso FROM materias WHERE id_materia = %s",
                (id_materia,),
            )
            fila = cur.fetchone()
            if fila is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la materia con ID '{id_materia}'",
                )
            nombre_materia = fila[0]
            try:
                cur.execute(
                    "DELETE FROM materias WHERE id_materia = %s",
                    (id_materia,),
                )
            except psycopg2.errors.ForeignKeyViolation:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"No se puede eliminar '{nombre_materia}' ({id_materia}) porque está "
                        "referenciada por el plan de estudios, matrículas u otros registros. "
                        "Quita esas referencias primero."
                    ),
                )
        conn.commit()
        return {
            "detalle": (
                f"La materia '{nombre_materia}' ({id_materia}) se eliminó correctamente."
            ),
            "id_materia": id_materia,
        }
    finally:
        conn.close()
