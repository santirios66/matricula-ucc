# ==========================================
# ARCHIVO: routers/notas.py
# FUNCIÓN: Endpoints CRUD de notas (GET y POST).
# ==========================================

import uuid

import psycopg2
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

try:
    from app.database import obtener_conexion
except ImportError:
    from database import obtener_conexion

router = APIRouter(prefix="/notas", tags=["notas"])


class NotaCreate(BaseModel):
    id_matricula: str = Field(..., min_length=1)
    nota1: float = Field(..., ge=0, le=5)
    nota2: float = Field(..., ge=0, le=5)
    nota3: float = Field(..., ge=0, le=5)


@router.get("/", status_code=status.HTTP_200_OK)
def listar_notas():
    """Devuelve todas las notas ordenadas por ID."""
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id_nota, id_matricula, id_materia, nota1, nota2, nota3, definitiva, estado "
                "FROM notas ORDER BY id_nota"
            )
            filas = cur.fetchall()
        return [
            {
                "id_nota": id_nota,
                "id_matricula": id_matricula,
                "id_materia": id_materia,
                "nota1": float(nota1) if nota1 is not None else None,
                "nota2": float(nota2) if nota2 is not None else None,
                "nota3": float(nota3) if nota3 is not None else None,
                "definitiva": float(definitiva) if definitiva is not None else None,
                "estado": estado,
            }
            for id_nota, id_matricula, id_materia, nota1, nota2, nota3, definitiva, estado in filas
        ]
    finally:
        conn.close()


@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_nota(nota: NotaCreate):
    """Crea una nota. Devuelve 404 si la matrícula no existe y 409 si ya tiene nota."""
    id_matricula = nota.id_matricula.strip()
    id_nota = str(uuid.uuid4())[:8]
    definitiva = round((nota.nota1 + nota.nota2 + nota.nota3) / 3, 2)
    estado = "Aprobado" if definitiva >= 3.0 else "Reprobado"

    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            # 1. La matrícula debe existir en matriculas (de ahí sale id_materia)
            cur.execute(
                "SELECT id_materia FROM matriculas WHERE id_matricula = %s",
                (id_matricula,),
            )
            fila_matricula = cur.fetchone()
            if fila_matricula is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la matrícula con ID '{id_matricula}'",
                )
            id_materia = fila_matricula[0]
            # 2. Esa matrícula no puede tener ya una nota
            cur.execute(
                "SELECT 1 FROM notas WHERE id_matricula = %s",
                (id_matricula,),
            )
            if cur.fetchone() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"La matrícula '{id_matricula}' ya tiene registrada una nota",
                )
            # 3. Rango 0.0-5.0 lo valida Pydantic (ge=0, le=5) -> 422
            try:
                cur.execute(
                    "INSERT INTO notas (id_nota, id_matricula, id_materia, nota1, nota2, nota3, definitiva, estado) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                    (
                        id_nota,
                        id_matricula,
                        id_materia,
                        nota.nota1,
                        nota.nota2,
                        nota.nota3,
                        definitiva,
                        estado,
                    ),
                )
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"La matrícula '{id_matricula}' ya tiene registrada una nota",
                )
            except psycopg2.errors.ForeignKeyViolation:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la matrícula con ID '{id_matricula}'",
                )
            cur.execute(
                "SELECT id_nota, id_matricula, id_materia, nota1, nota2, nota3, definitiva, estado "
                "FROM notas WHERE id_nota = %s",
                (id_nota,),
            )
            fila_creada = cur.fetchone()
        conn.commit()
        return {
            "id_nota": fila_creada[0],
            "id_matricula": fila_creada[1],
            "id_materia": fila_creada[2],
            "nota1": float(fila_creada[3]) if fila_creada[3] is not None else None,
            "nota2": float(fila_creada[4]) if fila_creada[4] is not None else None,
            "nota3": float(fila_creada[5]) if fila_creada[5] is not None else None,
            "definitiva": float(fila_creada[6]) if fila_creada[6] is not None else None,
            "estado": fila_creada[7],
        }
    finally:
        conn.close()
