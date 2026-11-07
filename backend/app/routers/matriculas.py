# ==========================================
# ARCHIVO: routers/matriculas.py
# FUNCIÓN: Endpoints CRUD de matrículas (GET y POST).
# ==========================================

import uuid

import psycopg2
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

try:
    from app.database import obtener_conexion
except ImportError:
    from database import obtener_conexion

router = APIRouter(prefix="/matriculas", tags=["matriculas"])


class MatriculaCreate(BaseModel):
    cedula: str = Field(..., min_length=1)
    id_materia: str = Field(..., min_length=1)
    periodo: str = Field(..., min_length=1)


@router.get("/", status_code=status.HTTP_200_OK)
def listar_matriculas():
    """Devuelve todas las matrículas ordenadas por ID."""
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id_matricula, cedula, id_materia, creditos, periodo, fecha_matricula, estado "
                "FROM matriculas ORDER BY id_matricula"
            )
            filas = cur.fetchall()
        return [
            {
                "id_matricula": id_matricula,
                "cedula": cedula,
                "id_materia": id_materia,
                "creditos": creditos,
                "periodo": periodo,
                "fecha_matricula": fecha_matricula,
                "estado": estado,
            }
            for id_matricula, cedula, id_materia, creditos, periodo, fecha_matricula, estado in filas
        ]
    finally:
        conn.close()


@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_matricula(matricula: MatriculaCreate):
    """Crea una matrícula. Devuelve 404 si el estudiante o la materia no existen, 409 si ya está matriculada o se supera el máximo de 19 créditos en el periodo."""
    cedula = matricula.cedula.strip()
    id_materia = matricula.id_materia.strip()
    periodo = matricula.periodo.strip()
    id_matricula = str(uuid.uuid4())[:8]
    estado = "Activa"

    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            # 1. La cédula debe existir en estudiantes
            cur.execute(
                "SELECT 1 FROM estudiantes WHERE id_estudiante = %s",
                (cedula,),
            )
            if cur.fetchone() is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe el estudiante con cédula '{cedula}'",
                )
            # 2. La materia debe existir en materias (y se toman sus créditos)
            cur.execute(
                "SELECT creditos FROM materias WHERE id_materia = %s",
                (id_materia,),
            )
            fila_materia = cur.fetchone()
            if fila_materia is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la materia con ID '{id_materia}'",
                )
            creditos_materia = fila_materia[0]
            # 3. El estudiante no puede repetir la misma materia en el mismo periodo
            cur.execute(
                "SELECT 1 FROM matriculas WHERE cedula = %s AND id_materia = %s AND periodo = %s",
                (cedula, id_materia, periodo),
            )
            if cur.fetchone() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"El estudiante '{cedula}' ya tiene matriculada la materia '{id_materia}' en el periodo '{periodo}'",
                )
            # 4. Regla de créditos: SUM calculado en SQL, máximo 19 por periodo
            cur.execute(
                "SELECT COALESCE(SUM(creditos), 0) FROM matriculas WHERE cedula = %s AND periodo = %s",
                (cedula, periodo),
            )
            suma_creditos = int(cur.fetchone()[0])
            total_creditos = suma_creditos + creditos_materia
            if total_creditos > 19:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"El estudiante '{cedula}' superaría el máximo de 19 créditos en el periodo '{periodo}': "
                        f"actual {suma_creditos} + nueva materia {creditos_materia} = {total_creditos} créditos"
                    ),
                )
            try:
                cur.execute(
                    "INSERT INTO matriculas (id_matricula, cedula, id_materia, creditos, periodo, estado) "
                    "VALUES (%s, %s, %s, %s, %s, %s)",
                    (
                        id_matricula,
                        cedula,
                        id_materia,
                        creditos_materia,
                        periodo,
                        estado,
                    ),
                )
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"El estudiante '{cedula}' ya tiene matriculada la materia '{id_materia}' en el periodo '{periodo}'",
                )
            except psycopg2.errors.ForeignKeyViolation:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe el estudiante con cédula '{cedula}' o la materia con ID '{id_materia}'",
                )
            cur.execute(
                "SELECT id_matricula, cedula, id_materia, creditos, periodo, fecha_matricula, estado "
                "FROM matriculas WHERE id_matricula = %s",
                (id_matricula,),
            )
            fila_creada = cur.fetchone()
        conn.commit()
        return {
            "id_matricula": fila_creada[0],
            "cedula": fila_creada[1],
            "id_materia": fila_creada[2],
            "creditos": fila_creada[3],
            "periodo": fila_creada[4],
            "fecha_matricula": fila_creada[5],
            "estado": fila_creada[6],
        }
    finally:
        conn.close()
