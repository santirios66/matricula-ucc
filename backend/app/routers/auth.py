# ==========================================
# ARCHIVO: routers/auth.py
# FUNCIÓN: Autenticación (login, cambiar-clave, restablecer-clave).
# Reutiliza seguridad.py y db_postgres.py; no duplica su lógica.
# ==========================================

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

try:
    from app.seguridad import crear_hash, generar_clave_temporal, verificar_clave
    from app.db_postgres import actualizar_clave, existe, insertar, obtener_usuario
except ImportError:
    from seguridad import crear_hash, generar_clave_temporal, verificar_clave
    from db_postgres import actualizar_clave, existe, insertar, obtener_usuario

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    usuario: str = Field(..., min_length=1)
    clave: str = Field(..., min_length=1)


class CambiarClaveRequest(BaseModel):
    usuario: str = Field(..., min_length=1)
    clave_actual: str = Field(..., min_length=1)
    clave_nueva: str = Field(..., min_length=1)


class RestablecerClaveRequest(BaseModel):
    usuario_admin: str = Field(..., min_length=1)
    clave_admin: str = Field(..., min_length=1)
    usuario_objetivo: str = Field(..., min_length=1)


class CuentaEstudianteRequest(BaseModel):
    id_estudiante: str = Field(..., min_length=1)


class CuentaProfesorRequest(BaseModel):
    id_profesor: str = Field(..., min_length=1)


@router.post("/login", status_code=status.HTTP_200_OK)
def login(datos: LoginRequest):
    """Verifica credenciales y devuelve rol/id_persona sin exponer sal ni hash."""
    usuario = datos.usuario.strip()
    clave = datos.clave.strip()

    fila = obtener_usuario(usuario)
    if fila is None or not verificar_clave(clave, fila[1], fila[2]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
        )
    return {
        "usuario": fila[0],
        "rol": fila[3],
        "id_persona": fila[4],
        "debe_cambiar_clave": bool(fila[5]),
    }


@router.post("/cambiar-clave", status_code=status.HTTP_200_OK)
def cambiar_clave(datos: CambiarClaveRequest):
    """Cambia la clave del usuario verificando la clave actual."""
    usuario = datos.usuario.strip()
    clave_actual = datos.clave_actual.strip()
    clave_nueva = datos.clave_nueva.strip()

    fila = obtener_usuario(usuario)
    if fila is None or not verificar_clave(clave_actual, fila[1], fila[2]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
        )
    if len(clave_nueva) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La clave nueva debe tener al menos 8 caracteres",
        )
    if clave_nueva == clave_actual:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La clave nueva debe ser distinta de la clave actual",
        )
    sal, password_hash = crear_hash(clave_nueva)
    actualizar_clave(usuario, sal, password_hash, debe_cambiar=False)
    return {"mensaje": "Contraseña actualizada"}


@router.post("/restablecer-clave", status_code=status.HTTP_200_OK)
def restablecer_clave(datos: RestablecerClaveRequest):
    """Solo un Administrador genera una clave temporal para otro usuario."""
    usuario_admin = datos.usuario_admin.strip()
    clave_admin = datos.clave_admin.strip()
    usuario_objetivo = datos.usuario_objetivo.strip()

    fila_admin = obtener_usuario(usuario_admin)
    if fila_admin is None or fila_admin[3] != "Administrador":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permiso denegado: se requiere rol Administrador",
        )
    if not verificar_clave(clave_admin, fila_admin[1], fila_admin[2]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
        )
    fila_objetivo = obtener_usuario(usuario_objetivo)
    if fila_objetivo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe el usuario '{usuario_objetivo}'",
        )
    clave_temporal = generar_clave_temporal()
    sal, password_hash = crear_hash(clave_temporal)
    actualizar_clave(usuario_objetivo, sal, password_hash, debe_cambiar=True)
    return {"usuario": usuario_objetivo, "clave_temporal": clave_temporal}


def _crear_cuenta(id_persona: str, rol: str):
    """Crea la cuenta de un estudiante o profesor con clave temporal (solo admin)."""
    tabla = "estudiantes" if rol == "Estudiante" else "profesores"
    columna = "id_estudiante" if rol == "Estudiante" else "id_profesor"
    if not existe(tabla, columna, id_persona):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe {'el estudiante' if rol == 'Estudiante' else 'el profesor'} con ID '{id_persona}'",
        )
    if obtener_usuario(id_persona) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La cuenta '{id_persona}' ya existe",
        )
    clave_temporal = generar_clave_temporal()
    sal, password_hash = crear_hash(clave_temporal)
    insertar(
        "usuarios",
        ["usuario", "sal", "password_hash", "rol", "id_persona", "debe_cambiar_clave"],
        [id_persona, sal, password_hash, rol, id_persona, True],
    )
    return {"usuario": id_persona, "rol": rol, "clave_temporal": clave_temporal}


@router.post("/crear-cuenta-estudiante", status_code=status.HTTP_201_CREATED)
def crear_cuenta_estudiante(datos: CuentaEstudianteRequest, _admin: dict = Depends(require_admin)):
    """Solo Administrador: crea la cuenta de un estudiante con clave temporal."""
    id_estudiante = datos.id_estudiante.strip()
    return _crear_cuenta(id_estudiante, "Estudiante")


@router.post("/crear-cuenta-profesor", status_code=status.HTTP_201_CREATED)
def crear_cuenta_profesor(datos: CuentaProfesorRequest, _admin: dict = Depends(require_admin)):
    """Solo Administrador: crea la cuenta de un profesor con clave temporal."""
    id_profesor = datos.id_profesor.strip()
    return _crear_cuenta(id_profesor, "Profesor")
