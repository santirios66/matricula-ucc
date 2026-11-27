# ==========================================
# ARCHIVO: jwt_api.py
# FUNCION: Genera y valida tokens JWT para la sesion.
# Reemplaza el flujo de X-Clave en cada peticion por un token
# firmado con expiracion (HS256). La clave firma desde JWT_SECRET
# en backend/.env (usa un valor aleatorio en produccion).
# ==========================================

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Clave para firmar tokens. Si no esta configurada, genera una
# aleatoria al arrancar (solo sirve para la sesion del proceso).
_JWT_SECRET = os.getenv("JWT_SECRET", os.urandom(32).hex())
JWT_ALGORITMO = "HS256"
JWT_EXPIRACION_HORAS = 8


def generar_token(usuario: str, rol: str, id_persona: str | None, clave: str) -> str:
    """Genera un JWT con el usuario, rol, id y la clave para no
    tener que reenviar X-Clave en cada peticion."""
    ahora = datetime.now(timezone.utc)
    payload = {
        "sub": usuario,
        "rol": rol,
        "id_persona": id_persona,
        "clave": clave,
        "iat": ahora,
        "exp": ahora + timedelta(hours=JWT_EXPIRACION_HORAS),
    }
    return jwt.encode(payload, _JWT_SECRET, algorithm=JWT_ALGORITMO)


def validar_token(token: str) -> dict | None:
    """Valida el JWT y devuelve el payload, o None si es invalido/expirado."""
    try:
        return jwt.decode(token, _JWT_SECRET, algorithms=[JWT_ALGORITMO])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def extraer_token(authorization: str | None) -> str | None:
    """Extrae el token Bearer del header Authorization."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization[7:]
