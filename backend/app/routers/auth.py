# ==========================================
# ARCHIVO: routers/auth.py
# FUNCIÓN: Autenticación (login, cambiar-clave, restablecer-clave).
# Reutiliza seguridad.py y db_postgres.py; no duplica su lógica.
# ==========================================

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

try:
    from app.seguridad import crear_hash, generar_clave_temporal, verificar_clave
    from app.db_postgres import actualizar_clave, existe, insertar, obtener_usuario
    from app.seguridad_api import require_admin
    from app.database import obtener_conexion
    from app.correos import enviar_correo
except ImportError:
    from seguridad import crear_hash, generar_clave_temporal, verificar_clave
    from db_postgres import actualizar_clave, existe, insertar, obtener_usuario
    from seguridad_api import require_admin
    from database import obtener_conexion
    from correos import enviar_correo

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


# ====== Recuperacion de clave por correo (migracion V11) ======

import hashlib
import secrets
from datetime import datetime, timedelta

EXPIRACION_MINUTOS = 15


class RecuperacionRequest(BaseModel):
    identificador: str = Field(..., min_length=1)


class RecuperacionConfirmarRequest(BaseModel):
    token: str = Field(..., min_length=10)
    clave_nueva: str = Field(..., min_length=1)


def _hash_token(token):
    """SHA-256 del token: en la base nunca queda el token en claro."""
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/recuperar-clave", status_code=status.HTTP_200_OK)
def solicitar_recuperacion(datos: RecuperacionRequest):
    """Genera un codigo temporal de 15 minutos y lo envia al correo registrado.

    Acepta el usuario de la cuenta o el correo del estudiante. La respuesta
    nunca revela si la cuenta existe. Sin SMTP configurado la API entra en
    modo desarrollo: el codigo se imprime en consola y se devuelve en la
    respuesta para poder probar el flujo completo.
    """
    identificador = datos.identificador.strip()
    if not identificador:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Escribe tu usuario o el correo registrado",
        )
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT u.usuario, e.correo FROM usuarios u "
                "LEFT JOIN estudiantes e ON e.id_estudiante = u.id_persona "
                "WHERE u.usuario = %s OR e.correo = %s LIMIT 1",
                (identificador, identificador),
            )
            fila = cur.fetchone()
            respuesta = {
                "mensaje": "Si la cuenta existe, recibiras un correo con el codigo de recuperacion."
            }
            if fila is None:
                return respuesta
            usuario, correo = fila
            token = secrets.token_urlsafe(32)
            cur.execute(
                "UPDATE usuarios SET reset_token = %s, reset_expira = %s WHERE usuario = %s",
                (
                    _hash_token(token),
                    datetime.now() + timedelta(minutes=EXPIRACION_MINUTOS),
                    usuario,
                ),
            )
        conn.commit()
    finally:
        conn.close()

    asunto = "Recuperacion de tu clave - Matricula UCC"
    cuerpo = (
        f"Hola {usuario}:\n\n"
        "Recibimos una solicitud para restablecer tu clave.\n"
        f"Codigo de recuperacion (valido {EXPIRACION_MINUTOS} minutos):\n\n"
        f"{token}\n\n"
        "Si no fuiste tu, ignora este mensaje y tu clave no cambia.\n"
    )
    enviado = bool(correo) and enviar_correo(correo, asunto, cuerpo)
    if enviado:
        respuesta["modo"] = "correo"
        print(f"[recuperacion] codigo enviado a {correo} para '{usuario}'")
    else:
        respuesta["modo"] = "desarrollo"
        respuesta["token"] = token
        print(f"[recuperacion] SMTP sin configurar: codigo para '{usuario}': {token}")
    return respuesta


@router.post("/recuperar-clave/confirmar", status_code=status.HTTP_200_OK)
def confirmar_recuperacion(datos: RecuperacionConfirmarRequest):
    """Cambia la clave con el codigo de recuperacion.

    El token se compara con el hash guardado y con su fecha de expiracion.
    Invalido o vencido: 422. La clave nueva requiere 8 caracteres o mas y el
    codigo es de un solo uso: se limpia al confirmar.
    """
    token = datos.token.strip()
    clave_nueva = datos.clave_nueva.strip()
    if len(clave_nueva) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La clave nueva debe tener al menos 8 caracteres",
        )
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT usuario FROM usuarios WHERE reset_token = %s AND reset_expira > NOW()",
                (_hash_token(token),),
            )
            fila = cur.fetchone()
            if fila is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="El codigo de recuperacion es invalido o ya expiro",
                )
            sal, password_hash = crear_hash(clave_nueva)
            cur.execute(
                "UPDATE usuarios SET sal = %s, password_hash = %s, debe_cambiar_clave = FALSE, "
                "reset_token = NULL, reset_expira = NULL WHERE usuario = %s",
                (sal, password_hash, fila[0]),
            )
        conn.commit()
    finally:
        conn.close()
    return {"mensaje": "Contrasena actualizada. Ya puedes iniciar sesion con tu nueva clave."}
