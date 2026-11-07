# ==========================================
# ARCHIVO: crear_admin.py
# FUNCIÓN: Crea la cuenta admin con una clave temporal. Se corre una sola vez.
# ==========================================

import db_postgres as db
from seguridad import generar_clave_temporal, crear_hash

if db.existe("usuarios", "usuario", "admin"):
    print("El usuario admin ya existe. No se creó nada.")
else:
    clave = generar_clave_temporal()
    sal, password_hash = crear_hash(clave)
    db.insertar(
        "usuarios",
        ["usuario", "sal", "password_hash", "rol", "debe_cambiar_clave"],
        ["admin", sal, password_hash, "Administrador", True],
    )
    print("Usuario creado.")
    print(f"Usuario: admin")
    print(f"Clave temporal: {clave}")
    print("Anótala: solo se muestra esta vez.")