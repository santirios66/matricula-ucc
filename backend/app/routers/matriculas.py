# ==========================================
# ARCHIVO: routers/matriculas.py
# FUNCIÓN: Endpoints CRUD de matrículas (GET y POST).
# ==========================================

import uuid

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

try:
    from app.database import obtener_conexion
    from app.seguridad_api import ROL_ADMIN, ROL_ESTUDIANTE, ROL_PROFESOR, autenticar, require_admin
except ImportError:
    from database import obtener_conexion
    from seguridad_api import ROL_ADMIN, ROL_ESTUDIANTE, ROL_PROFESOR, autenticar, require_admin

router = APIRouter(prefix="/matriculas", tags=["matriculas"])


class MatriculaCreate(BaseModel):
    cedula: str = Field(..., min_length=1)
    id_materia: str = Field(..., min_length=1)
    periodo: str = Field(..., min_length=1)


class MatriculaLoteCreate(BaseModel):
    cedula: str = Field(..., min_length=1)
    periodo: str = Field(..., min_length=1)
    id_materias: list[str] = Field(..., min_length=1)


@router.get("/", status_code=status.HTTP_200_OK)
def listar_matriculas(sesion: dict = Depends(autenticar)):
    """Devuelve las matrículas ordenadas por ID, filtradas por rol."""
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            if sesion["rol"] == ROL_ADMIN:
                cur.execute(
                    "SELECT id_matricula, cedula, id_materia, creditos, periodo, fecha_matricula, estado "
                    "FROM matriculas ORDER BY id_matricula"
                )
            elif sesion["rol"] == ROL_ESTUDIANTE:
                cur.execute(
                    "SELECT id_matricula, cedula, id_materia, creditos, periodo, fecha_matricula, estado "
                    "FROM matriculas WHERE cedula = %s ORDER BY id_matricula",
                    (sesion["id_persona"],),
                )
            elif sesion["rol"] == ROL_PROFESOR:
                cur.execute(
                    "SELECT m.id_matricula, m.cedula, m.id_materia, m.creditos, m.periodo, m.fecha_matricula, m.estado "
                    "FROM matriculas m JOIN materias mat ON mat.id_materia = m.id_materia "
                    "WHERE mat.id_profesor = %s ORDER BY m.id_matricula",
                    (sesion["id_persona"],),
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Rol no reconocido",
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


@router.post("/lote", status_code=status.HTTP_201_CREATED)
def crear_matriculas_lote(lote: MatriculaLoteCreate):
    """Matricula varias materias del carrito en una sola transacción.

    Valida el total de créditos del periodo (entre 6 y 19) y que ninguna
    materia esté ya matriculada. Si algo falla, no se guarda nada.
    """
    cedula = lote.cedula.strip()
    periodo = lote.periodo.strip()
    id_materias = [m.strip() for m in lote.id_materias]
    if any(not m for m in id_materias):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ninguna materia puede estar vacía",
        )

    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            # 1. El estudiante debe existir
            cur.execute(
                "SELECT 1 FROM estudiantes WHERE id_estudiante = %s",
                (cedula,),
            )
            if cur.fetchone() is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe el estudiante con cédula '{cedula}'",
                )
            # 2. Sin repetidas dentro del mismo carrito
            if len(set(id_materias)) != len(id_materias):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="El carrito tiene materias repetidas",
                )
            # 3. Créditos: materias existentes + SUM del periodo, todo en SQL
            cur.execute(
                "SELECT COALESCE(SUM(creditos), 0) FROM matriculas WHERE cedula = %s AND periodo = %s",
                (cedula, periodo),
            )
            suma_previa = int(cur.fetchone()[0])
            cur.execute(
                "SELECT COALESCE(SUM(creditos), 0) FROM materias WHERE id_materia = ANY(%s)",
                (id_materias,),
            )
            suma_nuevas = int(cur.fetchone()[0])
            cur.execute(
                "SELECT COUNT(*) FROM materias WHERE id_materia = ANY(%s)",
                (id_materias,),
            )
            encontradas = int(cur.fetchone()[0])
            if encontradas != len(set(id_materias)):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Una o más materias del carrito no existen",
                )
            total_creditos = suma_previa + suma_nuevas
            if total_creditos < 6 or total_creditos > 19:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"El total de créditos del periodo '{periodo}' es {total_creditos} "
                        f"({suma_previa} matriculados + {suma_nuevas} del carrito); "
                        "debe estar entre 6 y 19"
                    ),
                )
            # 4. Duplicados contra la base (mismo periodo)
            cur.execute(
                "SELECT m.id_materia FROM matriculas m "
                "WHERE m.cedula = %s AND m.periodo = %s AND m.id_materia = ANY(%s)",
                (cedula, periodo, id_materias),
            )
            repetidas = [fila[0] for fila in cur.fetchall()]
            if repetidas:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Ya están matriculadas en el periodo '{periodo}': {', '.join(repetidas)}",
                )
            # 5. Inserta todas en una sola transacción
            creadas = []
            for id_materia in id_materias:
                cur.execute(
                    "SELECT creditos FROM materias WHERE id_materia = %s",
                    (id_materia,),
                )
                creditos_materia = cur.fetchone()[0]
                id_matricula = str(uuid.uuid4())[:8]
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
                            "Activa",
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
                    "SELECT id_matricula, id_materia, creditos FROM matriculas WHERE id_matricula = %s",
                    (id_matricula,),
                )
                creadas.append(cur.fetchone())
        conn.commit()
        return {
            "cedula": cedula,
            "periodo": periodo,
            "total_creditos": total_creditos,
            "matriculas": [
                {
                    "id_matricula": fila[0],
                    "id_materia": fila[1],
                    "creditos": fila[2],
                }
                for fila in creadas
            ],
        }
    finally:
        conn.close()
