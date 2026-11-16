# ==========================================
# ARCHIVO: routers/tareas.py
# FUNCIÓN: Endpoints de tareas (las crea el profesor con archivo de
# apoyo opcional) y entregas (las sube el estudiante). Cada consulta
# incluye el estado de entrega según el rol de quien pregunta.
# El SQL usa solo %s, nunca f-strings.
# ==========================================

import uuid
from datetime import datetime

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Path, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

try:
    from app.almacenamiento import (
        guardar_archivo,
        media_type_de,
        ruta_de,
        validar_archivo,
    )
    from app.database import obtener_conexion
    from app.seguridad_api import ROL_ADMIN, ROL_ESTUDIANTE, ROL_PROFESOR, autenticar
except ImportError:
    from almacenamiento import guardar_archivo, media_type_de, ruta_de, validar_archivo
    from database import obtener_conexion
    from seguridad_api import ROL_ADMIN, ROL_ESTUDIANTE, ROL_PROFESOR, autenticar

router = APIRouter(prefix="/tareas", tags=["tareas"])


class CalificacionCreate(BaseModel):
    calificacion: float = Field(...)


class CalificacionEstudianteCreate(CalificacionCreate):
    cedula: str = Field(..., min_length=1)
    comentario: str | None = None

# Tipos de actividad válidos. Para los que se califican directamente
# (examen y quiz) el archivo de la entrega es opcional.
TIPOS_ACTIVIDAD = ("taller", "quiz", "examen", "trabajo")
TIPOS_SIN_ARCHIVO = ("examen", "quiz")


def _tipo_valido(tipo: str) -> str:
    """Devuelve el tipo limpio si es válido; 422 si no lo es."""
    tipo = (tipo or "").strip().lower()
    if tipo not in TIPOS_ACTIVIDAD:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"El tipo '{tipo or 'vacío'}' no es válido; usa uno de: "
                f"{', '.join(TIPOS_ACTIVIDAD)}"
            ),
        )
    return tipo


MOMENTOS_VALIDOS = (1, 2, 3)


def _momento_valido(momento) -> int:
    """Devuelve el momento (1, 2 o 3); 422 si falta o está fuera de rango."""
    if momento is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El momento es obligatorio; usa 1, 2 o 3",
        )
    if momento not in MOMENTOS_VALIDOS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"El momento {momento} no es válido; usa 1, 2 o 3",
        )
    return momento


def _calificacion_valida(valor: float) -> float:
    """Valida que la calificación esté entre 0.0 y 5.0; 422 si no."""
    try:
        calificacion = float(valor)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"La calificación '{valor}' no es un número",
        )
    if calificacion < 0.0 or calificacion > 5.0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"La calificación {calificacion} está fuera del rango permitido (0.0 a 5.0)",
        )
    return round(calificacion, 2)


def _parsear_fecha_limite(texto: str) -> datetime:
    """Convierte 'YYYY-MM-DDTHH:MM' (o con segundos) a datetime; 422 si no se puede."""
    try:
        return datetime.fromisoformat((texto or "").strip())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"La fecha límite '{texto}' no es válida; usa el formato "
                "año-mes-día y hora (por ejemplo 2026-11-20T23:59)"
            ),
        )


def _tarea_por_id(cur, id_tarea: str):
    """Devuelve (id_tarea, id_materia, titulo, descripcion, fecha_limite, archivo_apoyo, creada_por, creada_en, tipo) o None."""
    cur.execute(
        "SELECT t.id_tarea, t.id_materia, t.titulo, t.descripcion, t.fecha_limite, "
        "t.archivo_apoyo, t.creada_por, t.creada_en, t.tipo "
        "FROM tareas t WHERE t.id_tarea = %s",
        (id_tarea,),
    )
    return cur.fetchone()


def _esta_matriculado(cur, cedula: str, id_materia: str) -> bool:
    """True si el estudiante tiene matrícula Activa en la materia dentro de un periodo vigente.

    Las matrículas con periodo inexistente (p. ej. '2026-02') no cuentan,
    igual que hace el panel: se unen con periodos y se exige el rango vigente.
    """
    cur.execute(
        "SELECT 1 FROM matriculas m JOIN periodos p ON p.periodo = m.periodo "
        "WHERE m.cedula = %s AND m.id_materia = %s AND m.estado = 'Activa' "
        "AND CURRENT_DATE BETWEEN p.fecha_inicio AND p.fecha_fin LIMIT 1",
        (cedula, id_materia),
    )
    return cur.fetchone() is not None


def _archivo_en_disco(nombre: str, detalle: str) -> FileResponse:
    """Devuelve el archivo guardado como descarga; 404 si ya no está en disco."""
    ruta = ruta_de(nombre)
    if not ruta.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{detalle}: el archivo no está en el servidor",
        )
    return FileResponse(
        path=str(ruta),
        media_type=media_type_de(nombre),
        filename=ruta.name,
    )


@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_tarea(
    id_materia: str = Form(...),
    titulo: str = Form(...),
    descripcion: str = Form(...),
    fecha_limite: str = Form(...),
    tipo: str = Form(...),
    momento: int | None = Form(default=None),
    archivo: UploadFile | None = File(default=None),
    sesion: dict = Depends(autenticar),
):
    """Crea una tarea en una materia propia del profesor, con tipo, momento (1, 2 o 3)
    y apoyo opcional (PDF/MP4/WebM).

    El tipo y el momento son obligatorios. Para examen y quiz la actividad
    se califica directamente, sin entrega de archivo.
    """
    if sesion["rol"] != ROL_PROFESOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los profesores pueden crear tareas",
        )
    id_materia = (id_materia or "").strip()
    titulo = (titulo or "").strip()
    descripcion = (descripcion or "").strip()
    if not id_materia or not titulo or not descripcion:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Los campos id_materia, titulo, descripcion y tipo son obligatorios",
        )
    tipo = _tipo_valido(tipo)
    momento = _momento_valido(momento)
    if len(titulo) > 120:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"El título no puede superar 120 caracteres (llegó a {len(titulo)})",
        )
    fecha_limite_dt = _parsear_fecha_limite(fecha_limite)
    id_tarea = str(uuid.uuid4())[:8]

    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            # La materia debe existir y ser del profesor que la crea
            cur.execute(
                "SELECT id_profesor FROM materias WHERE id_materia = %s",
                (id_materia,),
            )
            fila_materia = cur.fetchone()
            if fila_materia is None or fila_materia[0] != sesion["id_persona"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"La materia '{id_materia}' no es tuya; solo puedes crear tareas en tus materias",
                )
            # Archivo de apoyo opcional: se valida y se guarda con nombre uuid4
            nombre_apoyo = None
            if archivo is not None and archivo.filename:
                extension = validar_archivo(archivo, campo="archivo")
                nombre_apoyo = guardar_archivo(archivo, extension)
            cur.execute(
                "INSERT INTO tareas (id_tarea, id_materia, titulo, descripcion, fecha_limite, archivo_apoyo, creada_por, tipo, momento) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (id_tarea, id_materia, titulo, descripcion, fecha_limite_dt, nombre_apoyo, sesion["id_persona"], tipo, momento),
            )
            cur.execute(
                "SELECT id_tarea, id_materia, titulo, descripcion, fecha_limite, archivo_apoyo, creada_por, creada_en, tipo, momento "
                "FROM tareas WHERE id_tarea = %s",
                (id_tarea,),
            )
            fila = cur.fetchone()
        conn.commit()
        return {
            "id_tarea": fila[0],
            "id_materia": fila[1],
            "titulo": fila[2],
            "descripcion": fila[3],
            "fecha_limite": fila[4],
            "tiene_apoyo": fila[5] is not None,
            "creada_por": fila[6],
            "creada_en": fila[7],
            "tipo": fila[8],
            "momento": fila[9],
        }
    finally:
        conn.close()


@router.get("/", status_code=status.HTTP_200_OK)
def listar_tareas(id_materia: str | None = None, sesion: dict = Depends(autenticar)):
    """Lista las tareas según el rol, con el estado de entrega de quien consulta."""
    id_materia = (id_materia or "").strip() or None
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            # Filtro por materia según el rol (dos consultas por rama, sin f-strings)
            if sesion["rol"] == ROL_ADMIN:
                if id_materia:
                    cur.execute(
                        "SELECT t.id_tarea, t.id_materia, t.titulo, t.descripcion, t.fecha_limite, "
                        "t.archivo_apoyo, t.creada_en, t.tipo, t.momento, mat.nombre_curso "
                        "FROM tareas t JOIN materias mat ON mat.id_materia = t.id_materia "
                        "WHERE t.id_materia = %s ORDER BY t.creada_en DESC, t.id_tarea",
                        (id_materia,),
                    )
                else:
                    cur.execute(
                        "SELECT t.id_tarea, t.id_materia, t.titulo, t.descripcion, t.fecha_limite, "
                        "t.archivo_apoyo, t.creada_en, t.tipo, t.momento, mat.nombre_curso "
                        "FROM tareas t JOIN materias mat ON mat.id_materia = t.id_materia "
                        "ORDER BY t.creada_en DESC, t.id_tarea"
                    )
            elif sesion["rol"] == ROL_PROFESOR:
                if id_materia:
                    cur.execute(
                        "SELECT t.id_tarea, t.id_materia, t.titulo, t.descripcion, t.fecha_limite, "
                        "t.archivo_apoyo, t.creada_en, t.tipo, t.momento, mat.nombre_curso "
                        "FROM tareas t JOIN materias mat ON mat.id_materia = t.id_materia "
                        "WHERE mat.id_profesor = %s AND t.id_materia = %s ORDER BY t.creada_en DESC, t.id_tarea",
                        (sesion["id_persona"], id_materia),
                    )
                else:
                    cur.execute(
                        "SELECT t.id_tarea, t.id_materia, t.titulo, t.descripcion, t.fecha_limite, "
                        "t.archivo_apoyo, t.creada_en, t.tipo, t.momento, mat.nombre_curso "
                        "FROM tareas t JOIN materias mat ON mat.id_materia = t.id_materia "
                        "WHERE mat.id_profesor = %s ORDER BY t.creada_en DESC, t.id_tarea",
                        (sesion["id_persona"],),
                    )
            elif sesion["rol"] == ROL_ESTUDIANTE:
                if id_materia:
                    cur.execute(
                        "SELECT t.id_tarea, t.id_materia, t.titulo, t.descripcion, t.fecha_limite, "
                        "t.archivo_apoyo, t.creada_en, t.tipo, t.momento, mat.nombre_curso "
                        "FROM tareas t JOIN materias mat ON mat.id_materia = t.id_materia "
                        "WHERE t.id_materia IN ("
                        "SELECT m.id_materia FROM matriculas m JOIN periodos p ON p.periodo = m.periodo "
                        "WHERE m.cedula = %s AND m.estado = 'Activa' "
                        "AND CURRENT_DATE BETWEEN p.fecha_inicio AND p.fecha_fin) "
                        "AND t.id_materia = %s ORDER BY t.fecha_limite, t.id_tarea",
                        (sesion["id_persona"], id_materia),
                    )
                else:
                    cur.execute(
                        "SELECT t.id_tarea, t.id_materia, t.titulo, t.descripcion, t.fecha_limite, "
                        "t.archivo_apoyo, t.creada_en, t.tipo, t.momento, mat.nombre_curso "
                        "FROM tareas t JOIN materias mat ON mat.id_materia = t.id_materia "
                        "WHERE t.id_materia IN ("
                        "SELECT m.id_materia FROM matriculas m JOIN periodos p ON p.periodo = m.periodo "
                        "WHERE m.cedula = %s AND m.estado = 'Activa' "
                        "AND CURRENT_DATE BETWEEN p.fecha_inicio AND p.fecha_fin) "
                        "ORDER BY t.fecha_limite, t.id_tarea",
                        (sesion["id_persona"],),
                    )
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Rol no reconocido",
                )
            filas = cur.fetchall()
            ahora = datetime.now()
            tareas = []
            for id_tarea, id_m, titulo, descripcion, fecha_limite, apoyo, creada_en, tipo, momento, nombre_materia in filas:
                tarea = {
                    "id_tarea": id_tarea,
                    "id_materia": id_m,
                    "materia": nombre_materia,
                    "titulo": titulo,
                    "descripcion": descripcion,
                    "fecha_limite": fecha_limite,
                    "tiene_apoyo": apoyo is not None,
                    "creada_en": creada_en,
                    "tipo": tipo,
                    "momento": momento,
                }
                if sesion["rol"] == ROL_ESTUDIANTE:
                    # La entrega más reciente del estudiante cuenta para el estado
                    cur.execute(
                        "SELECT subida_en, calificacion FROM entregas "
                        "WHERE id_tarea = %s AND cedula = %s ORDER BY subida_en DESC LIMIT 1",
                        (id_tarea, sesion["id_persona"]),
                    )
                    entrega = cur.fetchone()
                    if entrega is not None:
                        tarea["estado_entrega"] = "Entregado"
                        tarea["fecha_entrega"] = entrega[0]
                    elif fecha_limite >= ahora:
                        tarea["estado_entrega"] = "Pendiente"
                    else:
                        tarea["estado_entrega"] = "No entregó"
                    # Calificación de la actividad, si el profesor ya la registró
                    tarea["calificacion"] = float(entrega[1]) if entrega is not None and entrega[1] is not None else None
                else:
                    # Profesor y admin: cuántos entregaron de cuántos matriculados
                    cur.execute(
                        "SELECT COUNT(DISTINCT cedula) FROM entregas WHERE id_tarea = %s",
                        (id_tarea,),
                    )
                    tarea["entregas_recibidas"] = int(cur.fetchone()[0])
                    cur.execute(
                        "SELECT COUNT(DISTINCT m.cedula) FROM matriculas m JOIN periodos p ON p.periodo = m.periodo "
                        "WHERE m.id_materia = %s AND m.estado = 'Activa' "
                        "AND CURRENT_DATE BETWEEN p.fecha_inicio AND p.fecha_fin",
                        (id_m,),
                    )
                    tarea["matriculados"] = int(cur.fetchone()[0])
                tareas.append(tarea)
        return tareas
    finally:
        conn.close()


@router.post("/{id_tarea}/entregas", status_code=status.HTTP_201_CREATED)
def subir_entrega(
    id_tarea: str = Path(..., min_length=1),
    archivo: UploadFile | None = File(default=None),
    comentario: str | None = Form(default=None),
    sesion: dict = Depends(autenticar),
):
    """Sube la entrega de una tarea: solo el estudiante matriculado y dentro del plazo.

    Para 'taller' y 'trabajo' el archivo es obligatorio; para 'examen' y 'quiz'
    es opcional, porque la actividad se califica directamente.
    """
    if sesion["rol"] != ROL_ESTUDIANTE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los estudiantes pueden subir entregas",
        )
    comentario = (comentario or "").strip() or None
    id_entrega = str(uuid.uuid4())[:8]

    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            fila_tarea = _tarea_por_id(cur, id_tarea)
            if fila_tarea is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la tarea con ID '{id_tarea}'",
                )
            id_materia, fecha_limite, tipo = fila_tarea[1], fila_tarea[4], fila_tarea[8]
            # Debe estar matriculado en la materia de la tarea
            if not _esta_matriculado(cur, sesion["id_persona"], id_materia):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"No estás matriculado en la materia '{id_materia}'; no puedes entregar esta tarea",
                )
            # El plazo debe estar vigente
            if datetime.now() > fecha_limite:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"La fecha límite de esta tarea fue {fecha_limite} y ya pasó; "
                        "no se aceptan entregas fuera de plazo"
                    ),
                )
            # Archivo: obligatorio para taller/trabajo; opcional para examen/quiz.
            # Se valida y se guarda con nombre uuid4 (nunca el del cliente).
            if archivo is not None and archivo.filename:
                extension = validar_archivo(archivo, campo="archivo")
                nombre_guardado = guardar_archivo(archivo, extension)
            elif tipo in TIPOS_SIN_ARCHIVO:
                nombre_guardado = ""  # entrega sin archivo: se califica directamente
            else:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"El campo 'archivo' es obligatorio para tareas de tipo '{tipo}'"
                    ),
                )
            cur.execute(
                "INSERT INTO entregas (id_entrega, id_tarea, cedula, archivo, comentario) "
                "VALUES (%s, %s, %s, %s, %s)",
                (id_entrega, id_tarea, sesion["id_persona"], nombre_guardado, comentario),
            )
            cur.execute(
                "SELECT id_entrega, id_tarea, cedula, comentario, subida_en, calificacion "
                "FROM entregas WHERE id_entrega = %s",
                (id_entrega,),
            )
            fila = cur.fetchone()
        conn.commit()
        return {
            "id_entrega": fila[0],
            "id_tarea": fila[1],
            "cedula": fila[2],
            "comentario": fila[3],
            "subida_en": fila[4],
            "calificacion": float(fila[5]) if fila[5] is not None else None,
            "con_archivo": bool(nombre_guardado),
            "estado_entrega": "Entregado",
        }
    finally:
        conn.close()


@router.get("/{id_tarea}/entregas", status_code=status.HTTP_200_OK)
def listar_entregas(id_tarea: str = Path(..., min_length=1), sesion: dict = Depends(autenticar)):
    """Entregas recibidas (con nombre del estudiante) y lista de 'No entregaron'."""
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            fila_tarea = _tarea_por_id(cur, id_tarea)
            if fila_tarea is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la tarea con ID '{id_tarea}'",
                )
            id_materia, id_profesor = fila_tarea[1], fila_tarea[6]
            if sesion["rol"] == ROL_PROFESOR and id_profesor != sesion["id_persona"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Solo el profesor de la materia puede ver las entregas de esta tarea",
                )
            if sesion["rol"] == ROL_ESTUDIANTE:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Las entregas de una tarea solo las ve el profesor de la materia",
                )
            cur.execute(
                "SELECT e.id_entrega, e.cedula, es.nombre, es.apellidos, e.comentario, e.subida_en, "
                "e.archivo, e.calificacion "
                "FROM entregas e JOIN estudiantes es ON es.id_estudiante = e.cedula "
                "WHERE e.id_tarea = %s ORDER BY e.subida_en DESC, e.id_entrega",
                (id_tarea,),
            )
            entregas = [
                {
                    "id_entrega": id_entrega,
                    "cedula": cedula,
                    "nombre": f"{nombre} {apellidos}".strip(),
                    "comentario": comentario,
                    "subida_en": subida_en,
                    "con_archivo": bool(archivo_guardado),
                    "calificacion": float(calificacion) if calificacion is not None else None,
                }
                for id_entrega, cedula, nombre, apellidos, comentario, subida_en, archivo_guardado, calificacion
                in cur.fetchall()
            ]
            cur.execute(
                "SELECT DISTINCT m.cedula, es.nombre, es.apellidos "
                "FROM matriculas m JOIN estudiantes es ON es.id_estudiante = m.cedula "
                "JOIN periodos p ON p.periodo = m.periodo "
                "WHERE m.id_materia = %s AND m.estado = 'Activa' "
                "AND CURRENT_DATE BETWEEN p.fecha_inicio AND p.fecha_fin "
                "AND NOT EXISTS (SELECT 1 FROM entregas e WHERE e.id_tarea = %s AND e.cedula = m.cedula) "
                "ORDER BY m.cedula",
                (id_materia, id_tarea),
            )
            no_entregaron = [
                {"cedula": cedula, "nombre": f"{nombre} {apellidos}".strip()}
                for cedula, nombre, apellidos in cur.fetchall()
            ]
            # Estudiantes matriculados que todavía no tienen calificación en esta tarea
            # (sin entregas, o con entregas pero sin calificar)
            cur.execute(
                "SELECT DISTINCT m.cedula, es.nombre, es.apellidos "
                "FROM matriculas m JOIN estudiantes es ON es.id_estudiante = m.cedula "
                "JOIN periodos p ON p.periodo = m.periodo "
                "WHERE m.id_materia = %s AND m.estado = 'Activa' "
                "AND CURRENT_DATE BETWEEN p.fecha_inicio AND p.fecha_fin "
                "AND NOT EXISTS ("
                "SELECT 1 FROM entregas e WHERE e.id_tarea = %s AND e.cedula = m.cedula "
                "AND e.calificacion IS NOT NULL) "
                "ORDER BY m.cedula",
                (id_materia, id_tarea),
            )
            sin_calificacion = [
                {"cedula": cedula, "nombre": f"{nombre} {apellidos}".strip()}
                for cedula, nombre, apellidos in cur.fetchall()
            ]
        return {
            "id_tarea": id_tarea,
            "entregas": entregas,
            "no_entregaron": no_entregaron,
            "sin_calificacion": sin_calificacion,
        }
    finally:
        conn.close()


@router.put("/{id_tarea}/entregas/{id_entrega}/calificacion", status_code=status.HTTP_200_OK)
def calificar_entrega(
    id_tarea: str = Path(..., min_length=1),
    id_entrega: str = Path(..., min_length=1),
    datos: CalificacionCreate = Body(...),
    sesion: dict = Depends(autenticar),
):
    """Califica una entrega ya subida: solo el profesor dueño de la materia.

    La calificación va de 0.0 a 5.0 (422 si está fuera de rango).
    """
    if sesion["rol"] != ROL_PROFESOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el profesor de la materia puede calificar las entregas",
        )
    calificacion = _calificacion_valida(datos.calificacion)

    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            fila_tarea = _tarea_por_id(cur, id_tarea)
            if fila_tarea is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la tarea con ID '{id_tarea}'",
                )
            if fila_tarea[6] != sesion["id_persona"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Solo el profesor de la materia puede calificar las entregas de esta tarea",
                )
            cur.execute(
                "SELECT id_entrega FROM entregas WHERE id_entrega = %s AND id_tarea = %s",
                (id_entrega, id_tarea),
            )
            if cur.fetchone() is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la entrega '{id_entrega}' en la tarea '{id_tarea}'",
                )
            cur.execute(
                "UPDATE entregas SET calificacion = %s WHERE id_entrega = %s AND id_tarea = %s",
                (calificacion, id_entrega, id_tarea),
            )
            cur.execute(
                "SELECT id_entrega, id_tarea, cedula, comentario, subida_en, archivo, calificacion "
                "FROM entregas WHERE id_entrega = %s AND id_tarea = %s",
                (id_entrega, id_tarea),
            )
            id_e, id_t, cedula, comentario, subida_en, archivo_guardado, cal_final = cur.fetchone()
        conn.commit()
        return {
            "id_entrega": id_e,
            "id_tarea": id_t,
            "cedula": cedula,
            "comentario": comentario,
            "subida_en": subida_en,
            "con_archivo": bool(archivo_guardado),
            "calificacion": float(cal_final) if cal_final is not None else None,
        }
    finally:
        conn.close()


@router.post("/{id_tarea}/calificaciones", status_code=status.HTTP_201_CREATED)
def crear_calificacion_directa(
    id_tarea: str = Path(..., min_length=1),
    datos: CalificacionEstudianteCreate = Body(...),
    sesion: dict = Depends(autenticar),
):
    """Registra la calificación de una actividad 'examen' o 'quiz' sin entrega de archivo.

    El profesor dueño crea (o actualiza) la entrega del estudiante con la
    calificación directamente. No se exige plazo: se califica después de la actividad.
    """
    if sesion["rol"] != ROL_PROFESOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el profesor de la materia puede registrar calificaciones",
        )
    calificacion = _calificacion_valida(datos.calificacion)
    cedula = (datos.cedula or "").strip()
    comentario = (datos.comentario or "").strip() or None
    id_entrega = str(uuid.uuid4())[:8]

    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            fila_tarea = _tarea_por_id(cur, id_tarea)
            if fila_tarea is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la tarea con ID '{id_tarea}'",
                )
            id_materia, tipo = fila_tarea[1], fila_tarea[8]
            if fila_tarea[6] != sesion["id_persona"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Solo el profesor de la materia puede registrar calificaciones en esta tarea",
                )
            if tipo not in TIPOS_SIN_ARCHIVO:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"La calificación directa solo aplica a tareas de tipo 'examen' o 'quiz' "
                        f"(esta tarea es de tipo '{tipo}'); usa PUT .../entregas/{{id}}/calificacion"
                    ),
                )
            cur.execute(
                "SELECT id_estudiante FROM estudiantes WHERE id_estudiante = %s",
                (cedula,),
            )
            if cur.fetchone() is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe el estudiante con cédula '{cedula}'",
                )
            if not _esta_matriculado(cur, cedula, id_materia):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"El estudiante '{cedula}' no está matriculado en la materia '{id_materia}'; "
                        "no se puede registrar la calificación"
                    ),
                )
            # Si ya existe una entrega del estudiante (con o sin archivo) se actualiza;
            # si no, se crea la entrega con la calificación directamente.
            cur.execute(
                "SELECT id_entrega FROM entregas WHERE id_tarea = %s AND cedula = %s "
                "ORDER BY subida_en DESC LIMIT 1",
                (id_tarea, cedula),
            )
            fila_existente = cur.fetchone()
            if fila_existente is not None:
                id_entrega = fila_existente[0]
                cur.execute(
                    "UPDATE entregas SET calificacion = %s WHERE id_entrega = %s",
                    (calificacion, id_entrega),
                )
            else:
                cur.execute(
                    "INSERT INTO entregas (id_entrega, id_tarea, cedula, archivo, comentario, calificacion) "
                    "VALUES (%s, %s, %s, %s, %s, %s)",
                    (id_entrega, id_tarea, cedula, "", comentario, calificacion),
                )
            cur.execute(
                "SELECT id_entrega, id_tarea, cedula, comentario, subida_en, calificacion "
                "FROM entregas WHERE id_entrega = %s",
                (id_entrega,),
            )
            id_e, id_t, ced, com, subida_en, cal_final = cur.fetchone()
        conn.commit()
        return {
            "id_entrega": id_e,
            "id_tarea": id_t,
            "cedula": ced,
            "comentario": com,
            "subida_en": subida_en,
            "calificacion": float(cal_final) if cal_final is not None else None,
            "con_archivo": False,
        }
    finally:
        conn.close()


@router.get("/{id_tarea}/apoyo", status_code=status.HTTP_200_OK)
def descargar_apoyo(id_tarea: str = Path(..., min_length=1), sesion: dict = Depends(autenticar)):
    """Descarga el archivo de apoyo: solo el profesor dueño o un estudiante matriculado."""
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            fila_tarea = _tarea_por_id(cur, id_tarea)
            if fila_tarea is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la tarea con ID '{id_tarea}'",
                )
            id_materia, apoyo, id_profesor = fila_tarea[1], fila_tarea[5], fila_tarea[6]
            permitido = (
                (sesion["rol"] == ROL_PROFESOR and id_profesor == sesion["id_persona"])
                or (sesion["rol"] == ROL_ESTUDIANTE and _esta_matriculado(cur, sesion["id_persona"], id_materia))
            )
            if not permitido:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Solo el profesor de la materia y estudiantes matriculados pueden descargar el apoyo",
                )
            if not apoyo:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Esta tarea no tiene archivo de apoyo",
                )
        return _archivo_en_disco(apoyo, f"Apoyo de la tarea '{id_tarea}'")
    finally:
        conn.close()


@router.get("/{id_tarea}/entregas/{id_entrega}/archivo", status_code=status.HTTP_200_OK)
def descargar_entrega(
    id_tarea: str = Path(..., min_length=1),
    id_entrega: str = Path(..., min_length=1),
    sesion: dict = Depends(autenticar),
):
    """Descarga el archivo de una entrega: profesor dueño, admin o el estudiante autor."""
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT e.cedula, e.archivo, t.creada_por FROM entregas e "
                "JOIN tareas t ON t.id_tarea = e.id_tarea "
                "WHERE e.id_entrega = %s AND e.id_tarea = %s",
                (id_entrega, id_tarea),
            )
            fila = cur.fetchone()
            if fila is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No existe la entrega '{id_entrega}' en la tarea '{id_tarea}'",
                )
            cedula_autor, nombre_guardado, id_profesor = fila
            permitido = (
                sesion["rol"] == ROL_ADMIN
                or (sesion["rol"] == ROL_PROFESOR and id_profesor == sesion["id_persona"])
                or cedula_autor == sesion["id_persona"]
            )
            if not permitido:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Solo el profesor de la materia, el administrador y el autor de la entrega pueden descargar este archivo",
                )
            if not nombre_guardado:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Esta entrega no tiene archivo (la actividad se calificó directamente)",
                )
        return _archivo_en_disco(nombre_guardado, f"Archivo de la entrega '{id_entrega}'")
    finally:
        conn.close()
