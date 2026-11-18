# ==========================================
# ARCHIVO: routers/plan.py
# FUNCIÓN: Endpoints de Administrador para editar el plan de estudios (V7).
# Los cambios de plan NO afectan matrículas, notas ni tareas ya guardadas:
# solo cambian las materias disponibles para matricular a partir de ese
# momento. Una materia que sea requisito de otra del mismo plan no se puede
# quitar (409 con el nombre de la materia que depende).
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

router = APIRouter(prefix="/programas", tags=["plan de estudios"])


class PlanMateriaCreate(BaseModel):
    id_materia: str = Field(..., min_length=1)
    semestre: int = Field(..., ge=1, le=10)
    obligatoria: bool = True


class PlanMateriaUpdate(BaseModel):
    semestre: Optional[int] = Field(default=None, ge=1, le=10)
    obligatoria: Optional[bool] = None


def _nombre_programa(cur, id_programa):
    """Nombre del programa; 404 si no existe."""
    cur.execute(
        "SELECT nombre_programa FROM programas WHERE id_programa = %s",
        (id_programa,),
    )
    fila = cur.fetchone()
    if fila is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe el programa con ID '{id_programa}'",
        )
    return fila[0]


@router.get("/{id_programa}/plan", status_code=status.HTTP_200_OK)
def ver_plan(id_programa: str, _admin: dict = Depends(require_admin)):
    """Materias del plan de estudios del programa, con semestre y obligatoria."""
    id_programa = id_programa.strip()
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            nombre_programa = _nombre_programa(cur, id_programa)
            cur.execute(
                "SELECT pe.id_materia, m.nombre_curso, m.creditos, pe.semestre, pe.obligatoria "
                "FROM plan_estudios pe JOIN materias m ON m.id_materia = pe.id_materia "
                "WHERE pe.id_programa = %s "
                "ORDER BY pe.semestre, m.nombre_curso, pe.id_materia",
                (id_programa,),
            )
            filas = cur.fetchall()
        return [
            {
                "id_programa": id_programa,
                "nombre_programa": nombre_programa,
                "id_materia": id_materia,
                "nombre_curso": nombre_curso,
                "creditos": creditos,
                "semestre": semestre,
                "obligatoria": obligatoria,
            }
            for id_materia, nombre_curso, creditos, semestre, obligatoria in filas
        ]
    finally:
        conn.close()


@router.post("/{id_programa}/plan", status_code=status.HTTP_201_CREATED)
def agregar_materia_al_plan(
    id_programa: str,
    datos: PlanMateriaCreate,
    _admin: dict = Depends(require_admin),
):
    """Agrega una materia al plan del programa.

    409 si ya está en el plan; 404 si no existe el programa o la materia.
    """
    id_programa = id_programa.strip()
    id_materia = datos.id_materia.strip()
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            nombre_programa = _nombre_programa(cur, id_programa)
            cur.execute(
                "SELECT nombre_curso, creditos FROM materias WHERE id_materia = %s",
                (id_materia,),
            )
            fila_materia = cur.fetchone()
            if fila_materia is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la materia con ID '{id_materia}'",
                )
            nombre_materia, creditos = fila_materia
            cur.execute(
                "SELECT 1 FROM plan_estudios WHERE id_programa = %s AND id_materia = %s",
                (id_programa, id_materia),
            )
            if cur.fetchone() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"La materia '{nombre_materia}' ({id_materia}) ya está "
                        f"en el plan de '{nombre_programa}'"
                    ),
                )
            try:
                cur.execute(
                    "INSERT INTO plan_estudios (id_programa, id_materia, semestre, obligatoria) "
                    "VALUES (%s, %s, %s, %s)",
                    (id_programa, id_materia, datos.semestre, datos.obligatoria),
                )
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"La materia '{nombre_materia}' ({id_materia}) ya está "
                        f"en el plan de '{nombre_programa}'"
                    ),
                )
        conn.commit()
        return {
            "id_programa": id_programa,
            "nombre_programa": nombre_programa,
            "id_materia": id_materia,
            "nombre_curso": nombre_materia,
            "creditos": creditos,
            "semestre": datos.semestre,
            "obligatoria": datos.obligatoria,
        }
    finally:
        conn.close()


@router.put("/{id_programa}/plan/{id_materia}", status_code=status.HTTP_200_OK)
def actualizar_materia_del_plan(
    id_programa: str,
    id_materia: str,
    datos: PlanMateriaUpdate,
    _admin: dict = Depends(require_admin),
):
    """Cambia el semestre y/o si es obligatoria, para una materia del plan."""
    id_programa = id_programa.strip()
    id_materia = id_materia.strip()
    cambios = []
    valores = []
    if datos.semestre is not None:
        cambios.append("semestre = %s")
        valores.append(datos.semestre)
    if datos.obligatoria is not None:
        cambios.append("obligatoria = %s")
        valores.append(datos.obligatoria)
    if not cambios:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No se enviaron cambios: incluye semestre u obligatoria",
        )

    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            nombre_programa = _nombre_programa(cur, id_programa)
            cur.execute(
                "SELECT m.nombre_curso, m.creditos FROM plan_estudios pe "
                "JOIN materias m ON m.id_materia = pe.id_materia "
                "WHERE pe.id_programa = %s AND pe.id_materia = %s",
                (id_programa, id_materia),
            )
            fila = cur.fetchone()
            if fila is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"La materia '{id_materia}' no está en el plan de '{nombre_programa}'",
                )
            nombre_materia, creditos = fila
            # Los nombres de columna son fijos; los valores van con %s
            valores.extend([id_programa, id_materia])
            cur.execute(
                f"UPDATE plan_estudios SET {', '.join(cambios)} "
                "WHERE id_programa = %s AND id_materia = %s",
                tuple(valores),
            )
            cur.execute(
                "SELECT semestre, obligatoria FROM plan_estudios "
                "WHERE id_programa = %s AND id_materia = %s",
                (id_programa, id_materia),
            )
            semestre, obligatoria = cur.fetchone()
        conn.commit()
        return {
            "id_programa": id_programa,
            "nombre_programa": nombre_programa,
            "id_materia": id_materia,
            "nombre_curso": nombre_materia,
            "creditos": creditos,
            "semestre": semestre,
            "obligatoria": obligatoria,
        }
    finally:
        conn.close()


@router.delete("/{id_programa}/plan/{id_materia}", status_code=status.HTTP_200_OK)
def quitar_materia_del_plan(
    id_programa: str,
    id_materia: str,
    _admin: dict = Depends(require_admin),
):
    """Quita la materia del plan del programa.

    409 si otra materia del MISMO plan depende de ella como requisito previo
    (el mensaje incluye el nombre de la materia que depende); 404 si el
    programa no existe o la materia no está en el plan. Las matrículas,
    notas y tareas de esa materia ya guardadas NO se tocan.
    """
    id_programa = id_programa.strip()
    id_materia = id_materia.strip()
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            nombre_programa = _nombre_programa(cur, id_programa)
            cur.execute(
                "SELECT m.nombre_curso FROM plan_estudios pe "
                "JOIN materias m ON m.id_materia = pe.id_materia "
                "WHERE pe.id_programa = %s AND pe.id_materia = %s",
                (id_programa, id_materia),
            )
            fila = cur.fetchone()
            if fila is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"La materia '{id_materia}' no está en el plan de '{nombre_programa}'",
                )
            nombre_materia = fila[0]
            # Regla del plan: solo bloquea si la que depende está en el plan
            # de ESTE programa (una materia puede ser requisito de materias de
            # otros planes; eso no impide quitarla de este plan).
            cur.execute(
                "SELECT r.id_materia, ma.nombre_curso FROM requisitos r "
                "JOIN materias ma ON ma.id_materia = r.id_materia "
                "WHERE r.id_requisito = %s "
                "AND EXISTS ("
                "SELECT 1 FROM plan_estudios pe "
                "WHERE pe.id_programa = %s AND pe.id_materia = r.id_materia) "
                "ORDER BY ma.nombre_curso",
                (id_materia, id_programa),
            )
            dependientes = cur.fetchall()
            if dependientes:
                lista = ", ".join(f"'{nombre}' ({codigo})" for codigo, nombre in dependientes)
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"No se puede quitar '{nombre_materia}' ({id_materia}) del plan "
                        f"de '{nombre_programa}': {lista} depende de ella como requisito previo"
                    ),
                )
            cur.execute(
                "DELETE FROM plan_estudios WHERE id_programa = %s AND id_materia = %s",
                (id_programa, id_materia),
            )
        conn.commit()
        return {
            "detalle": (
                f"La materia '{nombre_materia}' ({id_materia}) salió del plan de '{nombre_programa}'. "
                "Las matrículas, notas y tareas ya guardadas no cambian."
            ),
            "id_programa": id_programa,
            "id_materia": id_materia,
        }
    finally:
        conn.close()
