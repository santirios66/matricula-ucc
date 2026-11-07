# ==========================================
# ARCHIVO: conexion_ejemplo.py
# FUNCIÓN: Plantilla de conexión a PostgreSQL.
# Para usarla: copia este archivo, renómbralo a conexion.py
# y reemplaza los valores marcados con TU_...
# ==========================================

import psycopg2

def obtener_conexion():
    """ Abre y devuelve una conexión nueva a PostgreSQL. """
    return psycopg2.connect(
        host="localhost",
        port="5432",                  # 5432 por defecto; 5433 si instalaste otra versión en ese puerto
        dbname="TU_BASE_DE_DATOS",    # nombre de la base que creaste en pgAdmin
        user="postgres",
        password="TU_CONTRASEÑA",     # contraseña del usuario postgres
    )

# Prueba rápida: solo corre si ejecutas este archivo directamente
if __name__ == "__main__":
    conn = obtener_conexion()
    cur = conn.cursor()
    cur.execute("SELECT version();")
    print(cur.fetchone()[0])
    cur.close()
    conn.close()
