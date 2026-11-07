# ==========================================
# ARCHIVO: database.py
# FUNCIÓN: Conexión a PostgreSQL leyendo credenciales
# desde variables de entorno (backend/.env). Nunca escribir claves aquí.
# ==========================================

import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

# backend/.env -> este archivo está en backend/app/, así que se sube un nivel
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def obtener_conexion():
    """Abre y devuelve una conexión nueva a PostgreSQL.

    Lee DB_HOST, DB_PORT, DB_NAME, DB_USER y DB_PASSWORD del entorno
    (cargado desde backend/.env). Falla con un error claro si falta alguna.
    """
    host = os.getenv("DB_HOST")
    db_name = os.getenv("DB_NAME")
    user = os.getenv("DB_USER")
    password = os.getenv("DB_PASSWORD")
    port = os.getenv("DB_PORT", "5432")

    faltantes = [
        nombre
        for nombre, valor in [
            ("DB_HOST", host),
            ("DB_NAME", db_name),
            ("DB_USER", user),
            ("DB_PASSWORD", password),
        ]
        if not valor
    ]
    if faltantes:
        raise RuntimeError(
            "Faltan variables de entorno: " + ", ".join(faltantes)
            + ". Revisa backend/.env"
        )

    return psycopg2.connect(
        host=host,
        port=int(port),
        dbname=db_name,
        user=user,
        password=password,
    )
