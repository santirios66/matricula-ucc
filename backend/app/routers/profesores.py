# ==========================================
# ARCHIVO: routers/profesores.py
# FUNCIÓN: Endpoints CRUD de profesores (GET y POST).
# ==========================================

import psycopg2
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

try:
    from app.database import obtener_conexion
except ImportError:
    from database import obtener_conexion

router = APIRouter(prefix="/profesores", tags=["profesores"])


class ProfesorCreate(BaseModel):
    id_profesor: str = Field(..., min_length=1)
    nombre: str = Field(..., min_length=1)
    apellidos: str = Field(..., min_length=1)


@router.get("/", status_code=status.HTTP_200_OK)
def listar_profesores():
    """Devuelve todos los profesores ordenados por ID."""
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id_profesor, nombre, apellidos FROM profesores ORDER BY id_profesor"
            )
            filas = cur.fetchall()
        return [
            {"id_profesor": id_profesor, "nombre": nombre, "apellidos": apellidos}
            for id_profesor, nombre, apellidos in filas
        ]
    finally:
        conn.close()


@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_profesor(profesor: ProfesorCreate):
    """Crea un profesor. Devuelve 409 si el ID ya existe."""
    id_profesor = profesor.id_profesor.strip()
    nombre = profesor.nombre.strip()
    apellidos = profesor.apellidos.strip()

    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM profesores WHERE id_profesor = %s",
                (id_profesor,),
            )
            if cur.fetchone() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Ya existe un profesor con ID '{id_profesor}'",
                )
            try:
                cur.execute(
                    "INSERT INTO profesores (id_profesor, nombre, apellidos) VALUES (%s, %s, %s)",
                    (id_profesor, nombre, apellidos),
                )
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Ya existe un profesor con ID '{id_profesor}'",
                )
        conn.commit()
        return {"id_profesor": id_profesor, "nombre": nombre, "apellidos": apellidos}
    finally:
        conn.close()
