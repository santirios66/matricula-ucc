
try:
    from app.database import obtener_conexion
except ImportError:
    from database import obtener_conexion

def existe(tabla, columna, valor):
    """ Devuelve True si ya hay una fila con ese valor en esa columna. """
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT 1 FROM {tabla} WHERE {columna} = %s", (str(valor).strip(),))
            return cur.fetchone() is not None
    finally:
        conn.close()

def insertar(tabla, columnas, valores):
    """ Mete una fila nueva en la tabla. Ej: insertar("facultades", ["id_facultad", "nombre_facultad"], ["F02", "Salud"]) """
    marcadores = ", ".join(["%s"] * len(valores))
    sql = f"INSERT INTO {tabla} ({', '.join(columnas)}) VALUES ({marcadores})"
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, valores)
        conn.commit()  # sin esto, el INSERT no se guarda
    finally:
        conn.close()

def obtener_opciones(tabla, col_id, col_nombre):
    """ Arma las opciones de los combobox con formato 'F01 - Ingeniería' """
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT {col_id}, {col_nombre} FROM {tabla} ORDER BY {col_id}")
            return [f"{id_} - {nombre}" for id_, nombre in cur.fetchall()]
    finally:
        conn.close()

def extraer_id(seleccion_combobox):
    """ 'F01 - Ingeniería' -> 'F01' """
    return seleccion_combobox.split(" - ")[0].strip()

def consultar(sql, params=()):
    """ Ejecuta un SELECT con consultas más complejas y devuelve las filas. """
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()
    finally:
        conn.close()
        

def obtener_usuario(usuario):
    """ Devuelve la fila del usuario o None si no existe. """
    filas = consultar(
        "SELECT usuario, sal, password_hash, rol, id_persona, debe_cambiar_clave FROM usuarios WHERE usuario = %s",
        (usuario,),
    )
    return filas[0] if filas else None

def actualizar_clave(usuario, sal, password_hash, debe_cambiar=False):
    """ Guarda una clave nueva (ya convertida a hash) para el usuario. """
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE usuarios SET sal = %s, password_hash = %s, debe_cambiar_clave = %s WHERE usuario = %s",
                (sal, password_hash, debe_cambiar, usuario),
            )
        conn.commit()
    finally:
        conn.close()