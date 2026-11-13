# ==========================================
# ARCHIVO: seguridad_api.py
# FUNCIÓN: Dependencias de control de acceso por rol para la API.
# Lee X-Usuario y X-Clave, verifica contra la tabla usuarios y
# entrega (usuario, rol, id_persona). Reutiliza seguridad.py y db_postgres.py.
# ==========================================

from fastapi import Header, HTTPException, status

try:
    from app.seguridad import verificar_clave
    from app.db_postgres import obtener_usuario
except ImportError:
    from seguridad import verificar_clave
    from db_postgres import obtener_usuario

ROL_ADMIN = "Administrador"
ROL_PROFESOR = "Profesor"
ROL_ESTUDIANTE = "Estudiante"


def autenticar(
    x_usuario: str = Header(default=""),
    x_clave: str = Header(default=""),
):
    """Dependencia: verifica credenciales en los encabezados y devuelve (usuario, rol, id_persona)."""
    usuario = (x_usuario or "").strip()
    clave = (x_clave or "").strip()
    if not usuario or not clave:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Faltan las credenciales (encabezados X-Usuario y X-Clave)",
        )
    fila = obtener_usuario(usuario)
    if fila is None or not verificar_clave(clave, fila[1], fila[2]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
        )
    return {"usuario": fila[0], "rol": fila[3], "id_persona": fila[4]}


def require_admin(
    x_usuario: str = Header(default=""),
    x_clave: str = Header(default=""),
):
    """Dependencia: autentica y exige rol Administrador (403 si no)."""
    sesion = autenticar(x_usuario=x_usuario, x_clave=x_clave)
    if sesion["rol"] != ROL_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permiso denegado: se requiere rol Administrador",
        )
    return sesion
