# ==========================================
# ARCHIVO: pdf_reportes.py
# FUNCIÓN: Consulta PostgreSQL y dibuja los PDF de recibo de matrícula y notas.
# ==========================================

from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
from reportlab.lib.units import cm

try:
    from app.database import obtener_conexion
except ImportError:
    from database import obtener_conexion

def _consulta(sql, params=()):
    """ Ejecuta una consulta SELECT y devuelve todas las filas. """
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()
    finally:
        conn.close()

def _estudiante(cedula):
    """ Devuelve (nombre, apellidos) o None si el estudiante no existe. """
    filas = _consulta(
        "SELECT nombre, apellidos FROM estudiantes WHERE id_estudiante = %s",
        (cedula,),
    )
    return filas[0] if filas else None

def generar_pdf_notas(cedula):
    """ Genera el boletín de calificaciones de un estudiante. """
    estudiante = _estudiante(cedula)
    if not estudiante:
        return False, "El estudiante no existe."

    # Una sola consulta: materias matriculadas + sus notas (si ya existen)
    filas = _consulta(
        """
        SELECT mat.nombre_curso, n.nota1, n.nota2, n.nota3, n.definitiva, n.estado
        FROM matriculas m
        JOIN materias mat ON mat.id_materia = m.id_materia
        LEFT JOIN notas n ON n.id_matricula = m.id_matricula
        WHERE m.cedula = %s
        ORDER BY mat.nombre_curso
        """,
        (cedula,),
    )

    datos_tabla = [["Materia", "N1", "N2", "N3", "Def", "Estado"]]
    for nombre_materia, n1, n2, n3, definitiva, estado in filas:
        if n1 is None:  # el profe todavía no calificó
            datos_tabla.append([nombre_materia, "-", "-", "-", "-", "Sin notas"])
        else:
            datos_tabla.append([
                nombre_materia,
                f"{n1:.2f}", f"{n2:.2f}", f"{n3:.2f}",
                f"{definitiva:.2f}", estado,
            ])

    archivo = f"Reporte_Notas_{cedula}.pdf"
    doc = SimpleDocTemplate(archivo, pagesize=letter)
    estilos = getSampleStyleSheet()

    contenido = [
        Paragraph("Reporte de Notas Académicas", estilos["Title"]), Spacer(1, 0.5 * cm),
        Paragraph(f"<b>Estudiante:</b> {estudiante[0]} {estudiante[1]}<br/><b>Cédula:</b> {cedula}", estilos["Normal"]),
        Spacer(1, 1 * cm),
    ]

    tabla = Table(datos_tabla, colWidths=[5*cm, 1.5*cm, 1.5*cm, 1.5*cm, 2*cm, 3*cm])
    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F6AA5")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))

    contenido.append(tabla)
    doc.build(contenido)
    return True, archivo

def generar_pdf_matricula(cedula):
    """ Genera el recibo de las materias matriculadas por el estudiante. """
    estudiante = _estudiante(cedula)
    if not estudiante:
        return False, "El estudiante no existe."

    filas = _consulta(
        """
        SELECT m.id_matricula, m.id_materia, mat.nombre_curso, m.creditos, m.periodo, m.fecha_matricula
        FROM matriculas m
        JOIN materias mat ON mat.id_materia = m.id_materia
        WHERE m.cedula = %s
        ORDER BY m.periodo, m.fecha_matricula, m.id_matricula
        """,
        (cedula,),
    )
    if not filas:
        return False, "El estudiante no tiene materias matriculadas."

    # Radicado: primeros 8 caracteres del id_matricula del primer registro del
    # periodo (el más antiguo), en mayúsculas.
    id_primer_registro = filas[0][0]
    radicado = str(id_primer_registro)[:8].upper()
    periodo_recibo = filas[0][4]
    fecha_matricula = filas[0][5]

    datos_tabla = [["Código", "Materia", "Créditos", "Periodo"]]
    total_creditos = 0
    for id_matricula, id_materia, nombre_materia, creditos, periodo, fecha in filas:
        total_creditos += creditos
        datos_tabla.append([id_materia, nombre_materia, creditos, periodo])
    datos_tabla.append(["", "TOTAL CRÉDITOS", total_creditos, ""])

    archivo = f"Recibo_Matricula_{cedula}.pdf"
    doc = SimpleDocTemplate(archivo, pagesize=letter)
    estilos = getSampleStyleSheet()

    contenido = [
        Paragraph("Recibo de Matrícula", estilos["Title"]), Spacer(1, 0.5 * cm),
        Paragraph(
            f"<b>Estudiante:</b> {estudiante[0]} {estudiante[1]}<br/>"
            f"<b>Cédula:</b> {cedula}<br/>"
            f"<b>Radicado:</b> {radicado}<br/>"
            f"<b>Periodo:</b> {periodo_recibo}<br/>"
            f"<b>Fecha de matrícula:</b> {fecha_matricula}",
            estilos["Normal"],
        ),
        Spacer(1, 1 * cm),
    ]

    tabla = Table(datos_tabla, colWidths=[3*cm, 7*cm, 3*cm, 3*cm])
    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2E8B57")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("FONTNAME", (1, -1), (-2, -1), "Helvetica-Bold"),
    ]))

    contenido.append(tabla)
    doc.build(contenido)
    return True, archivo