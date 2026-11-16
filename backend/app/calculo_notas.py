# ==========================================
# ARCHIVO: calculo_notas.py
# FUNCIÓN: Cálculo de N1, N2 y N3 a partir del momento de las tareas
# (1, 2 o 3) y la definitiva como promedio de los momentos con nota.
#
# Reglas:
# - De cada tarea cuenta la calificación de la entrega más reciente
#   (la misma regla que usa el reporte de notas).
# - Un momento sin calificaciones queda NULL, no 0.
# - La definitiva es el promedio de los N con valor; si solo hay uno,
#   es ese valor. Estado: Aprobado con 3.0 o más, Reprobado si no, y
#   "Pendiente" si no hay ninguna calificación.
# - Para cada matrícula, las notas registradas a mano en la tabla notas
#   tienen prioridad: el cálculo solo cubre matrículas sin notas.
# Todas las consultas usan solo %s, nunca f-strings.
# ==========================================

try:
    from app.database import obtener_conexion
except ImportError:
    from database import obtener_conexion


def _estado_de(definitiva):
    """Estado según la definitiva calculada; 'Pendiente' si no hay ninguna."""
    if definitiva is None:
        return "Pendiente"
    return "Aprobado" if definitiva >= 3.0 else "Reprobado"


def _armar(notas_por_momento):
    """Recibe {1: prom, 2: prom, 3: prom} y arma la fila (n1, n2, n3, definitiva, estado)."""
    n1 = round(notas_por_momento[1], 2) if 1 in notas_por_momento else None
    n2 = round(notas_por_momento[2], 2) if 2 in notas_por_momento else None
    n3 = round(notas_por_momento[3], 2) if 3 in notas_por_momento else None
    con_valor = [n for n in (n1, n2, n3) if n is not None]
    definitiva = round(sum(con_valor) / len(con_valor), 2) if con_valor else None
    return n1, n2, n3, definitiva, _estado_de(definitiva)


def calcular_notas_por_momento(cur, cedula):
    """Notas calculadas por momento para las matrículas SIN notas registradas a mano.

    Devuelve {id_matricula: {"id_materia": str, "nota1": float|None, "nota2": ...,
    "nota3": ..., "definitiva": ..., "estado": str}}. Toda matrícula del estudiante
    sin fila en notas aparece (con estado "Pendiente" si no hay calificaciones).
    """
    # Promedio por (matrícula, momento); de cada tarea cuenta la entrega más reciente
    cur.execute(
        """
        SELECT recientes.id_matricula, recientes.momento, AVG(recientes.calificacion)
        FROM (
            SELECT DISTINCT ON (m.id_matricula, t.id_tarea)
                   m.id_matricula, t.momento, e.calificacion
            FROM matriculas m
            JOIN tareas t ON t.id_materia = m.id_materia
            JOIN entregas e ON e.id_tarea = t.id_tarea
            WHERE m.cedula = %s
              AND t.momento IS NOT NULL
              AND e.calificacion IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM notas n WHERE n.id_matricula = m.id_matricula
              )
            ORDER BY m.id_matricula, t.id_tarea, e.subida_en DESC
        ) recientes
        GROUP BY recientes.id_matricula, recientes.momento
        """,
        (cedula,),
    )
    por_matricula = {}
    for id_matricula, momento, promedio in cur.fetchall():
        por_matricula.setdefault(id_matricula, {})[momento] = float(promedio)

    # Matrículas del estudiante sin notas a mano (con o sin calificaciones)
    cur.execute(
        """
        SELECT m.id_matricula, m.id_materia
        FROM matriculas m
        WHERE m.cedula = %s
          AND NOT EXISTS (SELECT 1 FROM notas n WHERE n.id_matricula = m.id_matricula)
        ORDER BY m.id_matricula
        """,
        (cedula,),
    )
    resultado = {}
    for id_matricula, id_materia in cur.fetchall():
        n1, n2, n3, definitiva, estado = _armar(por_matricula.get(id_matricula, {}))
        resultado[id_matricula] = {
            "id_materia": id_materia,
            "nota1": n1,
            "nota2": n2,
            "nota3": n3,
            "definitiva": definitiva,
            "estado": estado,
        }
    return resultado


def sugerencias_por_materia(cur, id_materia):
    """Notas calculadas por momento para cada estudiante matriculado en una materia.

    Es una sugerencia para el profesor: no filtra por notas a mano y cubre a
    todos los estudiantes con entregas calificadas en tareas con momento.
    Devuelve {cedula: {"nota1": ..., "nota2": ..., "nota3": ..., "definitiva": ..., "estado": str}}.
    """
    cur.execute(
        """
        SELECT recientes.cedula, recientes.momento, AVG(recientes.calificacion)
        FROM (
            SELECT DISTINCT ON (m.cedula, t.id_tarea)
                   m.cedula, t.momento, e.calificacion
            FROM matriculas m
            JOIN tareas t ON t.id_materia = m.id_materia
            JOIN entregas e ON e.id_tarea = t.id_tarea
            WHERE m.id_materia = %s
              AND t.momento IS NOT NULL
              AND e.calificacion IS NOT NULL
            ORDER BY m.cedula, t.id_tarea, e.subida_en DESC
        ) recientes
        GROUP BY recientes.cedula, recientes.momento
        """,
        (id_materia,),
    )
    por_estudiante = {}
    for cedula, momento, promedio in cur.fetchall():
        por_estudiante.setdefault(cedula, {})[momento] = float(promedio)

    resultado = {}
    for cedula, momentos in por_estudiante.items():
        n1, n2, n3, definitiva, estado = _armar(momentos)
        resultado[cedula] = {
            "nota1": n1,
            "nota2": n2,
            "nota3": n3,
            "definitiva": definitiva,
            "estado": estado,
        }
    return resultado
