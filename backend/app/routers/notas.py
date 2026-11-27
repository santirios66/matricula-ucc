# ==========================================
# ARCHIVO: routers/notas.py
# FUNCIÓN: Endpoints CRUD de notas (GET y POST).
# ==========================================

import uuid

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, Field

try:
    from app.calculo_notas import calcular_notas_por_momento, sugerencias_por_materia
    from app.database import obtener_conexion
    from app.seguridad_api import ROL_ADMIN, ROL_ESTUDIANTE, ROL_PROFESOR, autenticar, require_admin
except ImportError:
    from calculo_notas import calcular_notas_por_momento, sugerencias_por_materia
    from database import obtener_conexion
    from seguridad_api import ROL_ADMIN, ROL_ESTUDIANTE, ROL_PROFESOR, autenticar, require_admin

router = APIRouter(prefix="/notas", tags=["notas"])


class NotaCreate(BaseModel):
    id_matricula: str = Field(..., min_length=1)
    nota1: float = Field(..., ge=0, le=5)
    nota2: float = Field(..., ge=0, le=5)
    nota3: float = Field(..., ge=0, le=5)


@router.get("/", status_code=status.HTTP_200_OK)
def listar_notas(sesion: dict = Depends(autenticar)):
    """Devuelve las notas ordenadas por ID, filtradas por rol."""
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            if sesion["rol"] == ROL_ADMIN:
                cur.execute(
                    "SELECT id_nota, id_matricula, id_materia, nota1, nota2, nota3, definitiva, estado "
                    "FROM notas ORDER BY id_nota"
                )
            elif sesion["rol"] == ROL_ESTUDIANTE:
                cur.execute(
                    "SELECT n.id_nota, n.id_matricula, n.id_materia, n.nota1, n.nota2, n.nota3, n.definitiva, n.estado "
                    "FROM notas n JOIN matriculas m ON m.id_matricula = n.id_matricula "
                    "WHERE m.cedula = %s ORDER BY n.id_nota",
                    (sesion["id_persona"],),
                )
            elif sesion["rol"] == ROL_PROFESOR:
                cur.execute(
                    "SELECT n.id_nota, n.id_matricula, n.id_materia, n.nota1, n.nota2, n.nota3, n.definitiva, n.estado "
                    "FROM notas n JOIN matriculas m ON m.id_matricula = n.id_matricula "
                    "JOIN materias mat ON mat.id_materia = n.id_materia "
                    "WHERE mat.id_profesor = %s ORDER BY n.id_nota",
                    (sesion["id_persona"],),
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Rol no reconocido",
                )
            filas = cur.fetchall()
            # Para el estudiante: calificaciones de actividades (taller, quiz,
            # examen o trabajo) de cada materia, con tipo y título. Las demás
            # respuestas quedan igual que antes.
            actividades_por_materia = {}
            if sesion["rol"] == ROL_ESTUDIANTE:
                # La calificación que cuenta es la de la entrega más reciente de cada actividad
                cur.execute(
                    "SELECT DISTINCT ON (t.id_materia, t.id_tarea) t.id_materia, t.titulo, t.tipo, "
                    "e.calificacion, e.subida_en "
                    "FROM tareas t JOIN entregas e ON e.id_tarea = t.id_tarea "
                    "WHERE e.cedula = %s AND e.calificacion IS NOT NULL "
                    "ORDER BY t.id_materia, t.id_tarea, e.subida_en DESC",
                    (sesion["id_persona"],),
                )
                for id_materia, titulo, tipo, calificacion, subida_en in cur.fetchall():
                    actividades_por_materia.setdefault(id_materia, []).append(
                        {
                            "titulo": titulo,
                            "tipo": tipo,
                            "calificacion": float(calificacion),
                            "subida_en": subida_en,
                        }
                    )
            es_estudiante = sesion["rol"] == ROL_ESTUDIANTE
            respuesta = []
            for id_nota, id_matricula, id_materia, nota1, nota2, nota3, definitiva, estado in filas:
                fila = {
                    "id_nota": id_nota,
                    "id_matricula": id_matricula,
                    "id_materia": id_materia,
                    "nota1": float(nota1) if nota1 is not None else None,
                    "nota2": float(nota2) if nota2 is not None else None,
                    "nota3": float(nota3) if nota3 is not None else None,
                    "definitiva": float(definitiva) if definitiva is not None else None,
                    "estado": estado,
                    "calculada": False,
                }
                if es_estudiante:
                    fila["actividades"] = actividades_por_materia.get(id_materia, [])
                respuesta.append(fila)
            if es_estudiante:
                # Matrículas sin notas registradas a mano: N1/N2/N3 calculados desde
                # las tareas con momento (V6); la definitiva es el promedio de los
                # momentos con calificación y "Pendiente" si no hay ninguna.
                calculos = calcular_notas_por_momento(cur, sesion["id_persona"])
                for id_matricula, calculo in calculos.items():
                    respuesta.append({
                        "id_nota": None,
                        "id_matricula": id_matricula,
                        "id_materia": calculo["id_materia"],
                        "nota1": calculo["nota1"],
                        "nota2": calculo["nota2"],
                        "nota3": calculo["nota3"],
                        "definitiva": calculo["definitiva"],
                        "estado": calculo["estado"],
                        "calculada": True,
                        "actividades": actividades_por_materia.get(calculo["id_materia"], []),
                    })
            return respuesta
    finally:
        conn.close()


@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_nota(nota: NotaCreate, sesion: dict = Depends(autenticar)):
    """Crea una nota con reglas de rol. 404 si la matrícula no existe, 409 si ya tiene nota."""
    id_matricula = nota.id_matricula.strip()
    id_nota = str(uuid.uuid4())[:8]
    definitiva = round((nota.nota1 + nota.nota2 + nota.nota3) / 3, 2)
    estado = "Aprobado" if definitiva >= 3.0 else "Reprobado"

    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            # 1. La matrícula debe existir en matriculas (de ahí sale id_materia)
            cur.execute(
                "SELECT m.id_materia, mat.id_profesor FROM matriculas m "
                "JOIN materias mat ON mat.id_materia = m.id_materia "
                "WHERE m.id_matricula = %s",
                (id_matricula,),
            )
            fila_matricula = cur.fetchone()
            if fila_matricula is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la matrícula con ID '{id_matricula}'",
                )
            id_materia, id_profesor_materia = fila_matricula
            # 2. Reglas de rol
            if sesion["rol"] == ROL_ESTUDIANTE:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Un estudiante no puede registrar notas",
                )
            if sesion["rol"] == ROL_PROFESOR and id_profesor_materia != sesion["id_persona"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"La materia '{id_materia}' no es tuya; solo puedes registrar notas en tus materias",
                )
            # 3. Esa matrícula no puede tener ya una nota
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


@router.get("/sugerencias/{id_materia}", status_code=status.HTTP_200_OK)
def sugerencias_momento(id_materia: str = Path(..., min_length=1), sesion: dict = Depends(autenticar)):
    """Notas N1/N2/N3 calculadas desde las tareas con momento de una materia.

    Sugerencia de solo lectura para el profesor de la materia (el admin también
    puede consultarla): no cambia lo que el profesor escriba. Un momento sin
    calificaciones llega NULL, no 0.
    """
    id_materia = id_materia.strip()
    if sesion["rol"] == ROL_ESTUDIANTE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Las sugerencias de notas solo las consulta el profesor de la materia",
        )
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id_profesor FROM materias WHERE id_materia = %s",
                (id_materia,),
            )
            fila_materia = cur.fetchone()
            if fila_materia is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la materia con ID '{id_materia}'",
                )
            if sesion["rol"] == ROL_PROFESOR and fila_materia[0] != sesion["id_persona"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"La materia '{id_materia}' no es tuya; solo puedes consultar tus materias",
                )
            calculos = sugerencias_por_materia(cur, id_materia)
            respuesta = []
            for cedula in sorted(calculos):
                cur.execute(
                    "SELECT nombre, apellidos FROM estudiantes WHERE id_estudiante = %s",
                    (cedula,),
                )
                fila_estudiante = cur.fetchone()
                valores = calculos[cedula]
                respuesta.append({
                    "cedula": cedula,
                    "nombre": f"{fila_estudiante[0]} {fila_estudiante[1]}" if fila_estudiante else None,
                    "nota1": valores["nota1"],
                    "nota2": valores["nota2"],
                    "nota3": valores["nota3"],
                    "definitiva": valores["definitiva"],
                    "estado": valores["estado"],
                })
            return respuesta
    finally:
        conn.close()


# ====== PUT /notas/{id_nota}: editar una nota existente ======

class NotaUpdate(BaseModel):
    nota1: float = Field(..., ge=0, le=5)
    nota2: float = Field(..., ge=0, le=5)
    nota3: float = Field(..., ge=0, le=5)


@router.put("/{id_nota}", status_code=status.HTTP_200_OK)
def actualizar_nota(id_nota: str, cambios: NotaUpdate, sesion: dict = Depends(autenticar)):
    """Edita las tres notas de una nota existente y recalcula la definitiva."""
    id_nota = id_nota.strip()
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT n.id_matricula, n.id_materia, mat.id_profesor "
                "FROM notas n JOIN materias mat ON mat.id_materia = n.id_materia "
                "WHERE n.id_nota = %s",
                (id_nota,),
            )
            fila = cur.fetchone()
            if fila is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la nota '{id_nota}'",
                )
            id_matricula, id_materia, id_profesor = fila
            if sesion["rol"] == ROL_ESTUDIANTE:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Un estudiante no puede editar notas",
                )
            if sesion["rol"] == ROL_PROFESOR and id_profesor != sesion["id_persona"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"La materia '{id_materia}' no es tuya; solo puedes editar notas en tus materias",
                )
            definitiva = round((cambios.nota1 + cambios.nota2 + cambios.nota3) / 3, 2)
            estado = "Aprobado" if definitiva >= 3.0 else "Reprobado"
            cur.execute(
                "UPDATE notas SET nota1 = %s, nota2 = %s, nota3 = %s, definitiva = %s, estado = %s "
                "WHERE id_nota = %s",
                (cambios.nota1, cambios.nota2, cambios.nota3, definitiva, estado, id_nota),
            )
        conn.commit()
        return {
            "id_nota": id_nota,
            "id_matricula": id_matricula,
            "id_materia": id_materia,
            "nota1": cambios.nota1,
            "nota2": cambios.nota2,
            "nota3": cambios.nota3,
            "definitiva": definitiva,
            "estado": estado,
        }
    finally:
        conn.close()
