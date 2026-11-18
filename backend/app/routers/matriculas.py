# ==========================================
# ARCHIVO: routers/matriculas.py
# FUNCIÓN: Endpoints CRUD de matrículas (GET y POST).
# ==========================================

import uuid
from datetime import date

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

try:
    from app.calculo_notas import calcular_notas_por_momento
    from app.database import obtener_conexion
    from app.seguridad_api import ROL_ADMIN, ROL_ESTUDIANTE, ROL_PROFESOR, autenticar, require_admin
except ImportError:
    from calculo_notas import calcular_notas_por_momento
    from database import obtener_conexion
    from seguridad_api import ROL_ADMIN, ROL_ESTUDIANTE, ROL_PROFESOR, autenticar, require_admin

router = APIRouter(prefix="/matriculas", tags=["matriculas"])


def _aprobadas_por_materia(cur, cedula):
    """Definitiva más alta alcanzada por el estudiante en cada materia.

    Misma regla académica de la Parte 1 (materias-disponibles): cuenta las
    notas registradas a mano en la tabla notas y, para las matrículas sin
    notas, la definitiva calculada desde las tareas con momento (V6).
    Devuelve {id_materia: definitiva}; una materia está aprobada con >= 3.0.
    """
    cur.execute(
        "SELECT m.id_materia, MAX(n.definitiva) FROM notas n "
        "JOIN matriculas m ON m.id_matricula = n.id_matricula "
        "WHERE m.cedula = %s GROUP BY m.id_materia",
        (cedula,),
    )
    definitiva_por_materia = {
        id_materia: float(definitiva) for id_materia, definitiva in cur.fetchall()
    }
    for calculo in calcular_notas_por_momento(cur, cedula).values():
        if calculo["definitiva"] is None:
            continue
        actual = definitiva_por_materia.get(calculo["id_materia"])
        if actual is None or calculo["definitiva"] > actual:
            definitiva_por_materia[calculo["id_materia"]] = calculo["definitiva"]
    return definitiva_por_materia


class MatriculaCreate(BaseModel):
    cedula: str = Field(..., min_length=1)
    id_materia: str = Field(..., min_length=1)
    periodo: str = Field(..., min_length=1)


class MatriculaLoteCreate(BaseModel):
    cedula: str = Field(..., min_length=1)
    periodo: str = Field(..., min_length=1)
    id_materias: list[str] = Field(..., min_length=1)


def _cruce_horario(filas_materias):
    """Detecta si dos materias del carrito se cruzan en horario.

    Recibe filas de materias con columnas (id_materia, nombre_curso, cupos,
    creditos, dia, hora_inicio, hora_fin). Solo considera las materias que
    tienen las tres columnas de horario definidas (las que no las tienen
    quedan sin restricción de cruce). Devuelve None si no hay cruce, o el
    mensaje de error 422 si lo hay.
    """
    con_horario = [
        fila for fila in filas_materias
        if fila[4] is not None and fila[5] is not None and fila[6] is not None
    ]
    for i in range(len(con_horario)):
        for j in range(i + 1, len(con_horario)):
            id_a, nom_a, _, _, dia_a, hi_a, hf_a = con_horario[i]
            id_b, nom_b, _, _, dia_b, hi_b, hf_b = con_horario[j]
            if dia_a != dia_b:
                continue
            # Solapamiento de intervalos: inicio_a < fin_b  y  inicio_b < fin_a
            if hi_a < hf_b and hi_b < hf_a:
                return (
                    f"Cruce de horario: '{nom_a}' ({id_a}) y '{nom_b}' ({id_b}) "
                    f"ambas el {dia_a} ({hi_a}-{hf_a} y {hi_b}-{hf_b})"
                )
    return None


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
def crear_matricula(matricula: MatriculaCreate, sesion: dict = Depends(autenticar)):
    """Crea una matrícula con validaciones de rol, periodo, cupos, duplicados y créditos."""
    cedula = matricula.cedula.strip()
    id_materia = matricula.id_materia.strip()
    periodo = matricula.periodo.strip()
    id_matricula = str(uuid.uuid4())[:8]
    estado = "Activa"

    # Regla de rol: un estudiante solo puede matricular su propia cédula
    if sesion["rol"] == ROL_ESTUDIANTE and cedula != sesion["id_persona"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo puedes matricular tu propia cédula",
        )

    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            # 0. El periodo debe existir y estar vigente
            cur.execute(
                "SELECT fecha_inicio, fecha_fin FROM periodos WHERE periodo = %s",
                (periodo,),
            )
            fila_periodo = cur.fetchone()
            if fila_periodo is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"El periodo '{periodo}' no existe o no está abierto para matrícula",
                )
            fecha_inicio, fecha_fin = fila_periodo
            hoy = date.today()
            if not (fecha_inicio <= hoy <= fecha_fin):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"El periodo '{periodo}' está fuera del rango de matrícula "
                        f"({fecha_inicio} a {fecha_fin}); hoy es {hoy}"
                    ),
                )
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
            # 2. La materia debe existir en materias (créditos, cupos y nombre)
            cur.execute(
                "SELECT creditos, cupos, nombre_curso FROM materias WHERE id_materia = %s",
                (id_materia,),
            )
            fila_materia = cur.fetchone()
            if fila_materia is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la materia con ID '{id_materia}'",
                )
            creditos_materia, cupos_materia, nombre_materia = fila_materia
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
            # 4. Regla de cupos: cupos menos matriculados de esa materia en el periodo
            cur.execute(
                "SELECT COUNT(*) FROM matriculas WHERE id_materia = %s AND periodo = %s",
                (id_materia, periodo),
            )
            matriculados = int(cur.fetchone()[0])
            if matriculados >= cupos_materia:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"La materia '{nombre_materia}' no tiene cupos disponibles "
                        f"en el periodo '{periodo}' ({matriculados} de {cupos_materia})"
                    ),
                )
            # 5. Regla de créditos: SUM calculado en SQL, máximo 19 por periodo
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
def crear_matriculas_lote(lote: MatriculaLoteCreate, sesion: dict = Depends(autenticar)):
    """Matricula varias materias del carrito en una sola transacción.

    Valida rol, periodo vigente, que las materias pertenezcan al plan del
    programa del estudiante, cupos, duplicados, requisitos previos y el
    total de créditos del periodo (entre 6 y 19). Si algo falla, no se
    guarda nada. Cuando todo pasa, crea la cabecera del lote (V9) con su
    radicado y todas las materias del carrito quedan con ese id_lote.
    """
    cedula = lote.cedula.strip()
    periodo = lote.periodo.strip()
    id_materias = [m.strip() for m in lote.id_materias]
    if any(not m for m in id_materias):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ninguna materia puede estar vacía",
        )

    # Regla de rol: un estudiante solo puede matricular su propia cédula
    if sesion["rol"] == ROL_ESTUDIANTE and cedula != sesion["id_persona"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo puedes matricular tu propia cédula",
        )

    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            # 0. El periodo debe existir y estar vigente
            cur.execute(
                "SELECT fecha_inicio, fecha_fin FROM periodos WHERE periodo = %s",
                (periodo,),
            )
            fila_periodo = cur.fetchone()
            if fila_periodo is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"El periodo '{periodo}' no existe o no está abierto para matrícula",
                )
            fecha_inicio, fecha_fin = fila_periodo
            hoy = date.today()
            if not (fecha_inicio <= hoy <= fecha_fin):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"El periodo '{periodo}' está fuera del rango de matrícula "
                        f"({fecha_inicio} a {fecha_fin}); hoy es {hoy}"
                    ),
                )
            # 1. El estudiante debe existir; traemos su programa para el paso 2b
            cur.execute(
                "SELECT e.id_programa, p.nombre_programa FROM estudiantes e "
                "JOIN programas p ON p.id_programa = e.id_programa "
                "WHERE e.id_estudiante = %s",
                (cedula,),
            )
            fila_estudiante = cur.fetchone()
            if fila_estudiante is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe el estudiante con cédula '{cedula}'",
                )
            id_programa, nombre_programa = fila_estudiante
            # 2. Sin repetidas dentro del mismo carrito
            if len(set(id_materias)) != len(id_materias):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="El carrito tiene materias repetidas",
                )
            # 2b. Plan del programa (V7): todas las materias del carrito deben
            # estar en el plan de ESTE programa (validación por programa, no
            # por facultad; cierra el hueco de la auditoría)
            cur.execute(
                "SELECT m.nombre_curso FROM materias m "
                "WHERE m.id_materia = ANY(%s) "
                "AND NOT EXISTS ("
                "SELECT 1 FROM plan_estudios pe "
                "WHERE pe.id_materia = m.id_materia AND pe.id_programa = %s) "
                "ORDER BY m.nombre_curso",
                (id_materias, id_programa),
            )
            fuera_del_plan = [fila[0] for fila in cur.fetchall()]
            if fuera_del_plan:
                faltantes = ", ".join(f"'{nombre}'" for nombre in fuera_del_plan)
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        "Materias fuera del plan de estudios: "
                        f"{faltantes} no pertenece al plan de '{nombre_programa}'"
                    ),
                )
            # 3. Bloqueos de concurrencia (Parte 4): dentro de la transacción se
            # bloquean las filas ANTES de contar cupos y créditos, siempre en el
            # mismo orden para evitar interbloqueos:
            #   a) fila del estudiante: serializa dos lotes del mismo estudiante
            #      aunque aún no tenga matrículas (el SUM no puede correr en
            #      paralelo con el INSERT del otro lote),
            #   b) sus matrículas del periodo (las que existan),
            #   c) las materias del carrito por id_materia ascendente: serializa
            #      dos lotes que pegan por el último cupo; el que espera cuenta
            #      los cupos DESPUÉS de que el otro confirmó, y ve sus filas.
            cur.execute(
                "SELECT id_estudiante FROM estudiantes WHERE id_estudiante = %s FOR UPDATE",
                (cedula,),
            )
            cur.execute(
                "SELECT id_matricula FROM matriculas WHERE cedula = %s AND periodo = %s "
                "ORDER BY id_matricula FOR UPDATE",
                (cedula, periodo),
            )
            cur.execute(
                "SELECT id_materia, nombre_curso, cupos, creditos, dia, hora_inicio, hora_fin "
                "FROM materias WHERE id_materia = ANY(%s) ORDER BY id_materia FOR UPDATE",
                (id_materias,),
            )
            filas_materias = cur.fetchall()
            # 3b. Créditos: materias existentes + SUM del periodo, todo en SQL
            cur.execute(
                "SELECT COALESCE(SUM(creditos), 0) FROM matriculas WHERE cedula = %s AND periodo = %s",
                (cedula, periodo),
            )
            suma_previa = int(cur.fetchone()[0])
            suma_nuevas = int(sum(fila[3] for fila in filas_materias))
            encontradas = len(filas_materias)
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
            # 3c. Cruce de horario (Parte 7B): dos materias del carrito no pueden
            # coincidir el mismo día con horarios solapados. Se valida antes de
            # insertar nada: si falla, el rollback descarta todo el lote.
            mensaje_cruce = _cruce_horario(filas_materias)
            if mensaje_cruce:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=mensaje_cruce,
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
            # 4b. Cupos de cada materia del carrito (después de los FOR UPDATE
            # del paso 3: el conteo ve las filas confirmadas por el lote que
            # esperó el bloqueo; todo antes de insertar nada)
            cur.execute(
                "SELECT mat.id_materia, mat.nombre_curso, mat.cupos, "
                "COUNT(m.id_matricula) AS matriculados "
                "FROM materias mat "
                "LEFT JOIN matriculas m ON m.id_materia = mat.id_materia AND m.periodo = %s "
                "WHERE mat.id_materia = ANY(%s) "
                "GROUP BY mat.id_materia, mat.nombre_curso, mat.cupos",
                (periodo, id_materias),
            )
            for id_materia, nombre_materia, cupos_materia, matriculados in cur.fetchall():
                if int(matriculados) >= int(cupos_materia):
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=(
                            f"La materia '{nombre_materia}' no tiene cupos disponibles "
                            f"en el periodo '{periodo}' ({matriculados} de {cupos_materia})"
                        ),
                    )
            # 4c. Requisitos previos (V8): cada materia del carrito con requisito
            # exige que el estudiante lo tenga aprobado (definitiva >= 3.0 en
            # sus notas, a mano o calculadas por momento, la regla de la Parte 1)
            cur.execute(
                "SELECT r.id_materia, r.id_requisito, ma.nombre_curso, mr.nombre_curso "
                "FROM requisitos r "
                "JOIN materias ma ON ma.id_materia = r.id_materia "
                "JOIN materias mr ON mr.id_materia = r.id_requisito "
                "WHERE r.id_materia = ANY(%s) "
                "ORDER BY ma.nombre_curso, mr.nombre_curso",
                (id_materias,),
            )
            requisitos_del_carrito = cur.fetchall()
            if requisitos_del_carrito:
                aprobadas = _aprobadas_por_materia(cur, cedula)
                faltantes = []
                for _, id_requisito, nombre_materia_req, nombre_requisito in requisitos_del_carrito:
                    definitiva_req = aprobadas.get(id_requisito)
                    if definitiva_req is None or definitiva_req < 3.0:
                        faltantes.append(
                            f"'{nombre_materia_req}' requiere '{nombre_requisito}' aprobada "
                            f"(definitiva >= 3.0)"
                        )
                if faltantes:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="Requisitos previos sin aprobar: " + "; ".join(faltantes),
                    )
            # 5. Cabecera del lote (V9): un radicado nuevo para este carrito,
            # generado de un identificador nuevo (uuid), no de la primera fila
            # del estudiante. Todas las materias del carrito quedan con ese
            # id_lote; si algo falla después, el rollback la descarta también.
            id_lote = str(uuid.uuid4())[:8]
            radicado = uuid.uuid4().hex[:8].upper()
            while True:
                try:
                    cur.execute(
                        "INSERT INTO matriculas_lote (id_lote, radicado, cedula, periodo) "
                        "VALUES (%s, %s, %s, %s)",
                        (id_lote, radicado, cedula, periodo),
                    )
                    break
                except psycopg2.errors.UniqueViolation:
                    # id_lote o radicado repetido: casi imposible con uuid,
                    # se regeneran ambos y se intenta de nuevo
                    id_lote = str(uuid.uuid4())[:8]
                    radicado = uuid.uuid4().hex[:8].upper()
            # 5b. Inserta todas en una sola transacción, cada una con la cabecera
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
                        "INSERT INTO matriculas (id_matricula, cedula, id_materia, creditos, periodo, estado, id_lote) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                        (
                            id_matricula,
                            cedula,
                            id_materia,
                            creditos_materia,
                            periodo,
                            "Activa",
                            id_lote,
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
            "id_lote": id_lote,
            "radicado": radicado,
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
