# ==========================================
# ARCHIVO: routers/estudiantes.py
# FUNCIÓN: Endpoints CRUD de estudiantes (GET y POST).
# ==========================================

from datetime import date
from typing import Optional

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

try:
    from app.calculo_notas import calcular_notas_por_momento
    from app.database import obtener_conexion
    from app.seguridad_api import (
        ROL_ADMIN,
        ROL_ESTUDIANTE,
        autenticar,
        require_admin,
    )
except ImportError:
    from calculo_notas import calcular_notas_por_momento
    from database import obtener_conexion
    from seguridad_api import ROL_ADMIN, ROL_ESTUDIANTE, autenticar, require_admin

router = APIRouter(prefix="/estudiantes", tags=["estudiantes"])


def _definitivas_por_matricula(cur, cedula):
    """Definitiva de cada matricula del estudiante, con o sin nota a mano.

    Las notas registradas en la tabla ``notas`` tienen prioridad. Para las
    matriculas sin nota a mano se usa la definitiva calculada desde las tareas
    con momento (la misma regla de Mis notas y del PDF).
    """
    cur.execute(
        "SELECT n.id_matricula, n.definitiva FROM notas n "
        "JOIN matriculas m ON m.id_matricula = n.id_matricula "
        "WHERE m.cedula = %s AND n.definitiva IS NOT NULL",
        (cedula,),
    )
    definitivas = {
        id_matricula: float(definitiva)
        for id_matricula, definitiva in cur.fetchall()
    }
    for id_matricula, calculo in calcular_notas_por_momento(cur, cedula).items():
        if id_matricula not in definitivas and calculo["definitiva"] is not None:
            definitivas[id_matricula] = calculo["definitiva"]
    return definitivas


def _promedio_ponderado(filas):
    """Promedio de (creditos, nota) ponderado por creditos; None sin notas."""
    con_nota = [(creditos, nota) for creditos, nota in filas if nota is not None]
    total_creditos = sum(int(creditos) for creditos, _ in con_nota)
    if total_creditos == 0:
        return None
    suma = sum(int(creditos) * float(nota) for creditos, nota in con_nota)
    return round(suma / total_creditos, 2)


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


@router.get("/{cedula}/materias-disponibles", status_code=status.HTTP_200_OK)
def materias_disponibles(cedula: str):
    """Materias del plan de estudios del programa del estudiante (V7), para el carrito.

    Devuelve solo las materias del plan del programa del estudiante (no toda
    la facultad), con el semestre del plan y el estado académico de cada una:
    'Aprobada' (definitiva 3.0 o más en sus notas, registradas a mano o
    calculadas desde las tareas con momento), 'Matriculada' (tiene matrícula
    Activa en cualquier periodo) o 'Disponible'.

    Además incluye los requisitos de cada materia (V8) y cuáles le faltan al
    estudiante según la misma regla de aprobación (definitiva >= 3.0). El
    estado de la materia no cambia por estar bloqueada: la materia sigue en
    la lista y conserva su estado, pero 'bloqueada' queda en True.
    """
    cedula = cedula.strip()
    if not cedula:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La cédula no puede estar vacía",
        )
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT e.id_programa, p.id_facultad, p.nombre_programa, p.plan_referencia "
                "FROM estudiantes e JOIN programas p ON p.id_programa = e.id_programa "
                "WHERE e.id_estudiante = %s",
                (cedula,),
            )
            fila = cur.fetchone()
            if fila is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe el estudiante con cédula '{cedula}'",
                )
            id_programa, id_facultad, nombre_programa, plan_referencia = fila
            # Plan del programa del estudiante: ni materias de otros programas
            # ni el resto de la facultad
            cur.execute(
                "SELECT pe.id_materia, pe.semestre, pe.obligatoria, m.nombre_curso, "
                "m.creditos, m.cupos, m.horario, m.id_profesor, "
                "m.dia, m.hora_inicio, m.hora_fin "
                "FROM plan_estudios pe JOIN materias m ON m.id_materia = pe.id_materia "
                "WHERE pe.id_programa = %s "
                "ORDER BY pe.semestre, m.nombre_curso, pe.id_materia",
                (id_programa,),
            )
            filas = cur.fetchall()
            # Requisitos previos (V8) de las materias del plan, con el nombre
            # de la materia que se exige. Se consultan todos de una vez para
            # no repetir la consulta por cada materia.
            requisitos_por_materia = {}
            if filas:
                cur.execute(
                    "SELECT r.id_materia, r.id_requisito, mr.nombre_curso "
                    "FROM requisitos r "
                    "JOIN materias mr ON mr.id_materia = r.id_requisito "
                    "WHERE r.id_materia = ANY(%s) "
                    "ORDER BY r.id_materia, mr.nombre_curso",
                    ([fila[0] for fila in filas],),
                )
                for id_materia, id_requisito, nombre_requisito in cur.fetchall():
                    requisitos_por_materia.setdefault(id_materia, []).append(
                        {
                            "id_materia": id_requisito,
                            "nombre_curso": nombre_requisito,
                        }
                    )
            # Mejor definitiva por materia con notas registradas a mano
            cur.execute(
                "SELECT m.id_materia, MAX(n.definitiva) FROM notas n "
                "JOIN matriculas m ON m.id_matricula = n.id_matricula "
                "WHERE m.cedula = %s GROUP BY m.id_materia",
                (cedula,),
            )
            definitiva_por_materia = {id_materia: float(definitiva) for id_materia, definitiva in cur.fetchall()}
            # Matrículas del estudiante sin notas a mano: definitiva calculada
            # desde las tareas con momento (misma regla de Mis notas)
            calculos = calcular_notas_por_momento(cur, cedula)
            for calculo in calculos.values():
                if calculo["definitiva"] is not None:
                    actual = definitiva_por_materia.get(calculo["id_materia"])
                    if actual is None or calculo["definitiva"] > actual:
                        definitiva_por_materia[calculo["id_materia"]] = calculo["definitiva"]
            # Materias con matrícula Activa en cualquier periodo
            cur.execute(
                "SELECT DISTINCT id_materia FROM matriculas "
                "WHERE cedula = %s AND estado = 'Activa'",
                (cedula,),
            )
            matriculadas = {id_materia for (id_materia,) in cur.fetchall()}
        respuesta = []
        for id_materia, semestre, obligatoria, nombre_curso, creditos, cupos, horario, id_profesor, dia, hora_inicio, hora_fin in filas:
            definitiva = definitiva_por_materia.get(id_materia)
            if definitiva is not None and definitiva >= 3.0:
                estado = "Aprobada"
            elif id_materia in matriculadas:
                estado = "Matriculada"
            else:
                estado = "Disponible"
            requisitos = requisitos_por_materia.get(id_materia, [])
            requisitos_faltantes = []
            for requisito in requisitos:
                definitiva_requisito = definitiva_por_materia.get(requisito["id_materia"])
                if definitiva_requisito is None or definitiva_requisito < 3.0:
                    requisitos_faltantes.append(requisito)
            respuesta.append({
                "id_estudiante": cedula,
                "id_programa": id_programa,
                "id_facultad": id_facultad,
                "id_materia": id_materia,
                "nombre_curso": nombre_curso,
                "creditos": creditos,
                "cupos": cupos,
                "horario": horario,
                "id_profesor": id_profesor,
                "semestre": semestre,
                "obligatoria": obligatoria,
                "dia": dia,
                "hora_inicio": hora_inicio,
                "hora_fin": hora_fin,
                "estado": estado,
                "definitiva": definitiva,
                "requisitos": requisitos,
                "requisitos_faltantes": requisitos_faltantes,
                "bloqueada": bool(requisitos_faltantes),
            })
        return respuesta
    finally:
        conn.close()


@router.get("/{cedula}/matriculas", status_code=status.HTTP_200_OK)
def matriculas_por_periodo(
    cedula: str,
    periodo: str = Query(..., min_length=1),
    sesion: dict = Depends(autenticar),
):
    """Historial de materias y notas de un estudiante en un periodo.

    Devuelve una entrada por materia con ``id_materia``, ``nombre_curso``,
    ``creditos``, ``calificacion`` y ``nota_final`` (la definitiva registrada
    a mano o calculada desde las tareas), ``estado`` y los promedios
    ponderados por creditos del periodo y acumulado.

    El estado es ``Cursando`` mientras el periodo contiene la fecha de hoy;
    en un periodo cerrado es ``Aprobada`` con nota >= 3.0, ``Reprobada`` con
    nota < 3.0 o ``Sin nota`` si la materia no tiene definitiva.

    Solo el propio estudiante o un administrador pueden consultarlo.
    """
    cedula = cedula.strip()
    periodo = periodo.strip()
    if not cedula:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La cédula no puede estar vacía",
        )
    if not periodo:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El periodo no puede estar vacío",
        )
    if sesion["rol"] == ROL_ESTUDIANTE and cedula != sesion["id_persona"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo puedes consultar tus propias matrículas",
        )
    if sesion["rol"] not in (ROL_ADMIN, ROL_ESTUDIANTE):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el estudiante o el administrador pueden consultar el historial",
        )

    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM estudiantes WHERE id_estudiante = %s",
                (cedula,),
            )
            if cur.fetchone() is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe el estudiante con cédula '{cedula}'",
                )
            cur.execute(
                "SELECT fecha_inicio, fecha_fin FROM periodos WHERE periodo = %s",
                (periodo,),
            )
            fila_periodo = cur.fetchone()
            if fila_periodo is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"El periodo '{periodo}' no existe",
                )
            fecha_inicio, fecha_fin = fila_periodo
            abierto = fecha_inicio <= date.today() <= fecha_fin

            cur.execute(
                "SELECT m.id_matricula, m.id_materia, mat.nombre_curso, m.creditos "
                "FROM matriculas m JOIN materias mat ON mat.id_materia = m.id_materia "
                "WHERE m.cedula = %s AND m.periodo = %s "
                "ORDER BY mat.nombre_curso, m.id_materia",
                (cedula, periodo),
            )
            filas_periodo = cur.fetchall()

            definitivas = _definitivas_por_matricula(cur, cedula)
            materias = []
            for id_matricula, id_materia, nombre_curso, creditos in filas_periodo:
                nota_final = definitivas.get(id_matricula)
                if abierto:
                    estado = "Cursando"
                elif nota_final is None:
                    estado = "Sin nota"
                elif nota_final >= 3.0:
                    estado = "Aprobada"
                else:
                    estado = "Reprobada"
                materias.append(
                    {
                        "id_matricula": id_matricula,
                        "id_materia": id_materia,
                        "nombre_curso": nombre_curso,
                        "creditos": creditos,
                        "calificacion": nota_final,
                        "nota_final": nota_final,
                        "estado": estado,
                    }
                )

            cur.execute(
                "SELECT id_matricula, creditos FROM matriculas WHERE cedula = %s",
                (cedula,),
            )
            filas_acumulado = cur.fetchall()

        promedio_semestre = _promedio_ponderado(
            [
                (creditos, definitivas.get(id_matricula))
                for id_matricula, _, _, creditos in filas_periodo
            ]
        )
        promedio_acumulado = _promedio_ponderado(
            [
                (creditos, definitivas.get(id_matricula))
                for id_matricula, creditos in filas_acumulado
            ]
        )
        return {
            "cedula": cedula,
            "periodo": periodo,
            "periodo_abierto": abierto,
            "materias": materias,
            "promedio_semestre": promedio_semestre,
            "promedio_acumulado": promedio_acumulado,
        }
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
