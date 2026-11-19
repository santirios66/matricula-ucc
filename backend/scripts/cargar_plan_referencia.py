# ==========================================
# ARCHIVO: scripts/cargar_plan_referencia.py
# FUNCIÓN: Carga (o reinicia) los planes de estudio de referencia de los
# tres programas demo: Ingeniería de Sistemas (P01), Ingeniería Civil (P03)
# y Enfermería (P02). Crea las materias del plan y las asigna a un
# semestre (1 a 8) con su condición de obligatoria o electiva.
#
# Reglas del script:
# - Reinicia SOLO los planes de estos tres programas: borra las filas de
#   plan_estudios de P01, P02 y P03 y las vuelve a cargar. No borra
#   estudiantes, matrículas ni notas.
# - Marca los tres programas con plan_referencia = TRUE y los demás con
#   FALSE, para que la marca identifique los planes de demostración.
# - Idempotente: puede correrse varias veces sin duplicar filas
#   (INSERT ... ON CONFLICT y reinicio de plan_estudios).
# - Sistemas y Civil comparten solo las materias base de ingeniería
#   (cálculo, física, programación y álgebra, códigos B01 a B05); cada
#   programa además tiene materias propias del semestre 1 al 8. Las
#   materias M01 a M04 del demo antiguo (tareas y notas) quedan intactas
#   y fuera de los planes de referencia.
# Todas las consultas usan solo %s, nunca f-strings.
# ==========================================

import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

# .env del backend: el script vive en backend/scripts/
RUTA_ENV = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(RUTA_ENV)

PROGRAMAS = [
    # (id_programa, nombre_programa, id_facultad)
    ("P01", "Ingeniería de Sistemas", "F01"),
    ("P02", "Enfermería", "F02"),
    ("P03", "Ingeniería Civil", "F01"),
]
PROGRAMAS_PLAN = tuple(p[0] for p in PROGRAMAS)

FACULTADES = [
    ("F01", "Ingeniería"),
    ("F02", "Salud"),
]

# Materias del plan de referencia. id_facultad: F01 para las de ingeniería
# (base, Sistemas y Civil) y F02 para las de Enfermería.
MATERIAS = [
    # (id_materia, nombre_curso, creditos, cupos, id_facultad)
    # Materias base compartidas por Sistemas y Civil
    ("B01", "Cálculo 1",            4, 30, "F01"),
    ("B02", "Física 1",             4, 30, "F01"),
    ("B03", "Programación 1",       3, 30, "F01"),
    ("B04", "Álgebra Lineal",       3, 30, "F01"),
    ("B05", "Cálculo 2",            4, 30, "F01"),
    # Propias de Ingeniería de Sistemas (semestre 1 al 8)
    ("IS01", "Introducción a la Ingeniería de Sistemas", 2, 30, "F01"),
    ("IS02", "Programación 2",                3, 30, "F01"),
    ("IS03", "Estructuras de Datos",          4, 30, "F01"),
    ("IS04", "Bases de Datos",                4, 30, "F01"),
    ("IS05", "Redes de Computadores",         3, 30, "F01"),
    ("IS06", "Tópicos Avanzados de Computación", 3, 20, "F01"),
    ("IS07", "Sistemas Operativos",           4, 30, "F01"),
    ("IS08", "Proyecto de Grado",             5, 20, "F01"),
    # Propias de Ingeniería Civil (semestre 1 al 8)
    ("IC01", "Introducción a la Ingeniería Civil", 2, 30, "F01"),
    ("IC02", "Estática",                    4, 30, "F01"),
    ("IC03", "Dinámica",                    4, 30, "F01"),
    ("IC04", "Materiales de Construcción",  3, 30, "F01"),
    ("IC05", "Mecánica de Suelos",          4, 30, "F01"),
    ("IC06", "Teoría de Estructuras",       4, 30, "F01"),
    ("IC07", "Hidráulica",                  4, 30, "F01"),
    ("IC08", "Proyecto de Grado Civil",     5, 20, "F01"),
    # Propias de Enfermería (semestre 1 al 8)
    ("EN01", "Fundamentos de Enfermería",   3, 30, "F02"),
    ("EN02", "Anatomía Humana",             4, 30, "F02"),
    ("EN03", "Bioquímica",                  3, 30, "F02"),
    ("EN04", "Farmacología",                4, 30, "F02"),
    ("EN05", "Salud Comunitaria",           3, 30, "F02"),
    ("EN06", "Enfermería del Adulto Mayor", 3, 30, "F02"),
    ("EN07", "Práctica Clínica",            5, 20, "F02"),
    ("EN08", "Práctica Profesional",        6, 20, "F02"),
]

# Plan por programa: (id_programa, id_materia, semestre, obligatoria)
PLAN = []
# Base compartida: Sistemas y Civil (semestres 1 y 2)
for codigo, semestre in [("B01", 1), ("B02", 1), ("B03", 1), ("B04", 2), ("B05", 2)]:
    PLAN.append(("P01", codigo, semestre, True))
    PLAN.append(("P03", codigo, semestre, True))
# Propias de Sistemas: una por semestre del 1 al 8
for numero, codigo in enumerate(
    ["IS01", "IS02", "IS03", "IS04", "IS05", "IS06", "IS07", "IS08"], start=1
):
    obligatoria = codigo != "IS06"  # Tópicos Avanzados: electiva de ejemplo
    PLAN.append(("P01", codigo, numero, obligatoria))
# Propias de Civil: una por semestre del 1 al 8
for numero, codigo in enumerate(
    ["IC01", "IC02", "IC03", "IC04", "IC05", "IC06", "IC07", "IC08"], start=1
):
    PLAN.append(("P03", codigo, numero, True))
# Propias de Enfermería: una por semestre del 1 al 8
for numero, codigo in enumerate(
    ["EN01", "EN02", "EN03", "EN04", "EN05", "EN06", "EN07", "EN08"], start=1
):
    obligatoria = codigo != "EN05"  # Salud Comunitaria: electiva de ejemplo
    PLAN.append(("P02", codigo, numero, obligatoria))


def main():
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", "5432")),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )
    try:
        cur = conn.cursor()
        # 1) Facultades de referencia (si no existen)
        for id_facultad, nombre in FACULTADES:
            cur.execute(
                "INSERT INTO facultades (id_facultad, nombre_facultad) VALUES (%s, %s) "
                "ON CONFLICT (id_facultad) DO NOTHING",
                (id_facultad, nombre),
            )
        # 2) Programas de referencia (actualiza nombre y facultad si ya existen)
        for id_programa, nombre, id_facultad in PROGRAMAS:
            cur.execute(
                "INSERT INTO programas (id_programa, nombre_programa, id_facultad) "
                "VALUES (%s, %s, %s) "
                "ON CONFLICT (id_programa) DO UPDATE SET "
                "nombre_programa = EXCLUDED.nombre_programa, "
                "id_facultad = EXCLUDED.id_facultad",
                (id_programa, nombre, id_facultad),
            )
        # 3) Marca: los tres son planes de referencia; los demás no
        cur.execute(
            "UPDATE programas SET plan_referencia = TRUE WHERE id_programa = ANY(%s)",
            (list(PROGRAMAS_PLAN),),
        )
        cur.execute(
            "UPDATE programas SET plan_referencia = FALSE "
            "WHERE NOT (id_programa = ANY(%s))",
            (list(PROGRAMAS_PLAN),),
        )
        # 4) Materias del plan (crea o actualiza las de códigos B/IS/IC/EN;
        #    no toca M01 a M04 ni ninguna otra materia existente)
        for id_materia, nombre, creditos, cupos, id_facultad in MATERIAS:
            cur.execute(
                "INSERT INTO materias (id_materia, nombre_curso, creditos, cupos, id_facultad, horario, id_profesor) "
                "VALUES (%s, %s, %s, %s, %s, NULL, NULL) "
                "ON CONFLICT (id_materia) DO UPDATE SET "
                "nombre_curso = EXCLUDED.nombre_curso, "
                "creditos = EXCLUDED.creditos, "
                "cupos = EXCLUDED.cupos, "
                "id_facultad = EXCLUDED.id_facultad",
                (id_materia, nombre, creditos, cupos, id_facultad),
            )
        # 5) Reinicia SOLO los planes de los tres programas y recarga
        cur.execute(
            "DELETE FROM plan_estudios WHERE id_programa = ANY(%s)",
            (list(PROGRAMAS_PLAN),),
        )
        for id_programa, id_materia, semestre, obligatoria in PLAN:
            cur.execute(
                "INSERT INTO plan_estudios (id_programa, id_materia, semestre, obligatoria) "
                "VALUES (%s, %s, %s, %s) ON CONFLICT (id_programa, id_materia) DO NOTHING",
                (id_programa, id_materia, semestre, obligatoria),
            )
        conn.commit()
        # 6) Resumen de lo cargado
        cur.execute(
            "SELECT p.id_programa, p.nombre_programa, p.plan_referencia, COUNT(pe.id_materia) "
            "FROM programas p LEFT JOIN plan_estudios pe ON pe.id_programa = p.id_programa "
            "GROUP BY p.id_programa, p.nombre_programa, p.plan_referencia "
            "ORDER BY p.id_programa"
        )
        print("programas (id, nombre, plan_referencia, materias en plan):")
        for fila in cur.fetchall():
            print("  ", fila)
        cur.execute("SELECT COUNT(*) FROM materias")
        print("total materias:", cur.fetchone()[0])
        cur.execute("SELECT COUNT(*) FROM plan_estudios")
        print("total filas de plan:", cur.fetchone()[0])
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
