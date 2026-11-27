# ==========================================
# ARCHIVO: seguridad_api.py
# FUNCIÓN: Dependencias de control de acceso por rol para la API.
# Soporta DOS modos de autenticación:
#   1. JWT Bearer (moderno): "Authorization: Bearer <token>"
#   2. X-Usuario / X-Clave (compatibilidad con el portal vanilla JS)
# Reutiliza seguridad.py, db_postgres.py y jwt_api.py.
# ==========================================

from fastapi import Header, HTTPException, status

try:
    from app.seguridad import verificar_clave
    from app.db_postgres import obtener_usuario
    from app.jwt_api import validar_token, extraer_token
except ImportError:
    from seguridad import verificar_clave
    from db_postgres import obtener_usuario
    from jwt_api import validar_token, extraer_token

ROL_ADMIN = "Administrador"
ROL_PROFESOR = "Profesor"
ROL_ESTUDIANTE = "Estudiante"


def _autenticar_headers(x_usuario: str, x_clave: str) -> dict | None:
    """Autentica con X-Usuario / X-Clave. Devuelve la sesion o None."""
    usuario = (x_usuario or "").strip()
    clave = (x_clave or "").strip()
    if not usuario or not clave:
        return None
    fila = obtener_usuario(usuario)
    if fila is None or not verificar_clave(clave, fila[1], fila[2]):
        return None
    return {"usuario": fila[0], "rol": fila[3], "id_persona": fila[4]}


def _autenticar_jwt(authorization: str) -> dict | None:
    """Autentica con JWT Bearer. Devuelve la sesion o None."""
    token = extraer_token(authorization)
    if not token:
        return None
    payload = validar_token(token)
    if payload is None:
        return None
    return {
        "usuario": payload.get("sub"),
        "rol": payload.get("rol"),
        "id_persona": payload.get("id_persona"),
    }


def autenticar(
    x_usuario: str = Header(default=""),
    x_clave: str = Header(default=""),
    authorization: str = Header(default=""),
) -> dict:
    """Dependencia: verifica credenciales y devuelve (usuario, rol, id_persona).

    Intenta primero JWT (Authorization: Bearer) y luego X-Usuario / X-Clave.
    Así el portal vanilla sigue funcionando mientras el React usa JWT.
    """
    # Intentar JWT primero
    sesion = _autenticar_jwt(authorization)
    if sesion is not None:
        return sesion

    # Fallback a X-Usuario / X-Clave
    sesion = _autenticar_headers(x_usuario, x_clave)
    if sesion is not None:
        return sesion

    # Si llego aqui, ninguna autenticacion funciono
    if authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token JWT invalido o expirado. Vuelve a iniciar sesion.",
        )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Faltan las credenciales (Authorization: Bearer o X-Usuario y X-Clave)",
    )


def require_admin(
    x_usuario: str = Header(default=""),
    x_clave: str = Header(default=""),
    authorization: str = Header(default=""),
) -> dict:
    """Dependencia: autentica y exige rol Administrador (403 si no)."""
    sesion = autenticar(x_usuario=x_usuario, x_clave=x_clave, authorization=authorization)
    if sesion["rol"] != ROL_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permiso denegado: se requiere rol Administrador",
        )
    return sesion
