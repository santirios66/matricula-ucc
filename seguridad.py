# ==========================================
# ARCHIVO: seguridad.py
# FUNCIÓN: Genera claves temporales y verifica contraseñas (hash + sal).
# ==========================================

import hashlib
import hmac
import os
import secrets
import string

ITERACIONES = 200_000
# Sin caracteres confusos (0/O, l/1/I) para que el estudiante no se equivoque al leerla
ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"

def generar_clave_temporal(longitud=8):
    """ Clave aleatoria de 8 caracteres con letras y números. """
    while True:
        clave = "".join(secrets.choice(ALFABETO) for _ in range(longitud))
        if any(c.isdigit() for c in clave) and any(c.isalpha() for c in clave):
            return clave

def _hash(clave, sal_hex):
    """ Mezcla la clave con la sal 200.000 veces (PBKDF2). """
    return hashlib.pbkdf2_hmac("sha256", clave.encode(), bytes.fromhex(sal_hex), ITERACIONES).hex()

def crear_hash(clave):
    """ Devuelve (sal, hash) listos para guardar en la base. """
    sal = os.urandom(16).hex()
    return sal, _hash(clave, sal)

def verificar_clave(clave, sal, hash_guardado):
    """ True si la clave coincide. compare_digest compara sin filtrar información por tiempo. """
    return hmac.compare_digest(_hash(clave, sal), hash_guardado)