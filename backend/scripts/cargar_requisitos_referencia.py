# ==========================================
# ARCHIVO: scripts/cargar_requisitos_referencia.py
# FUNCIÓN: Carga los requisitos previos de referencia de las materias de los
# planes demo (V8). Datos separados de la migración, igual que en la Parte 1.
#
# Reglas del script:
# - Cálculo 2 (B05, base compartida de Sistemas y Civil) requiere Cálculo 1 (B01).
# - Materias de semestres superiores de cada programa requieren una materia
#   del MISMO programa del semestre anterior. Solo ejemplos de demo, no todas:
#     P01 (Sistemas):  IS03 requiere IS02, IS05 requiere IS04
#     P03 (Civil):     IC03 requiere IC02, IC06 requiere IC05
#     P02 (Enfermería): EN04 requiere EN03, EN06 requiere EN05
# - Reinicia SOLO los requisitos de las materias de referencia (códigos B, IS,
#   IC y EN listados aquí): borra esas filas de requisitos y las vuelve a
#   cargar. No borra estudiantes, matrículas ni notas.
# - Idempotente: puede correrse varias veces sin duplicar filas.
# - Antes de insertar verifica que cada pareja (materia, requisito) exista y
#   pertenezca al menos a un mismo plan de estudios (requisito del mismo programa).
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

# Requisitos de referencia: (id_materia, id_requisito).
REQUISITOS = [
    ("B05", "B01"),     # Cálculo 2 requiere Cálculo 1 (base Sistemas y Civil)
    ("IS03", "IS02"),   # Estructuras de Datos requiere Programación 2 (P01, sem 3 <- 2)
    ("IS05", "IS04"),   # Redes de Computadores requiere Bases de Datos (P01, sem 5 <- 4)
    ("IC03", "IC02"),   # Dinámica requiere Estática (P03, sem 3 <- 2)
    ("IC06", "IC05"),   # Teoría de Estructuras requiere Mecánica de Suelos (P03, sem 5 <- 4)
    ("EN04", "EN03"),   # Farmacología requiere Bioquímica (P02, sem 4 <- 3)
    ("EN06", "EN05"),   # Enfermería del Adulto Mayor requiere Salud Comunitaria (P02, sem 6 <- 5)
]
MATERIAS_GESTIONADAS = sorted({par[0] for par in REQUISITOS})


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
        # 0) Verificación previa: las dos materias de cada pareja deben existir
        #    y compartir al menos un plan de estudios (requisito del mismo programa)
        cur.execute(
            "SELECT id_materia, nombre_curso FROM materias WHERE id_materia = ANY(%s)",
            ([id_m for par in REQUISITOS for id_m in par],),
        )
        nombres = {id_m: nombre for id_m, nombre in cur.fetchall()}
        faltantes = [id_m for par in REQUISITOS for id_m in par if id_m not in nombres]
        if faltantes:
            raise RuntimeError(
                "Faltan materias en la base; corre antes cargar_plan_referencia.py: "
                + ", ".join(sorted(faltantes))
            )
        for id_materia, id_requisito in REQUISITOS:
            cur.execute(
                "SELECT COUNT(DISTINCT pe.id_programa) FROM plan_estudios pe "
                "WHERE pe.id_materia = %s "
                "AND pe.id_programa IN (SELECT id_programa FROM plan_estudios WHERE id_materia = %s)",
                (id_requisito, id_materia),
            )
            compartidos = int(cur.fetchone()[0])
            if compartidos == 0:
                raise RuntimeError(
                    f"La pareja ({id_materia}, {id_requisito}) no comparte ningún programa: "
                    "el requisito debe ser del mismo programa"
                )
        # 1) Reinicia SOLO los requisitos de las materias gestionadas y recarga
        cur.execute(
            "DELETE FROM requisitos WHERE id_materia = ANY(%s)",
            (MATERIAS_GESTIONADAS,),
        )
        borrados = cur.rowcount
        for id_materia, id_requisito in REQUISITOS:
            cur.execute(
                "INSERT INTO requisitos (id_materia, id_requisito) VALUES (%s, %s) "
                "ON CONFLICT (id_materia, id_requisito) DO NOTHING",
                (id_materia, id_requisito),
            )
        conn.commit()
        # 2) Resumen de lo cargado
        cur.execute(
            "SELECT r.id_materia, ma.nombre_curso, r.id_requisito, mr.nombre_curso "
            "FROM requisitos r "
            "JOIN materias ma ON ma.id_materia = r.id_materia "
            "JOIN materias mr ON mr.id_materia = r.id_requisito "
            "ORDER BY r.id_materia"
        )
        print("requisitos cargados (materia -> requisito):")
        for id_materia, nombre_materia, id_requisito, nombre_requisito in cur.fetchall():
            print(f"  {id_materia} {nombre_materia} -> {id_requisito} {nombre_requisito}")
        cur.execute("SELECT COUNT(*) FROM requisitos")
        print("total filas de requisitos:", cur.fetchone()[0], f"(borradas antes: {borrados})")
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
