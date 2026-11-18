# ==========================================
# ARCHIVO: pdf_reportes.py
# FUNCIÓN: Consulta PostgreSQL y dibuja los PDF de recibo de matrícula y notas.
# El boletín de notas incluye además las calificaciones de tareas
# (taller, quiz, examen o trabajo) de la entrega más reciente de cada actividad.
# ==========================================

from datetime import datetime

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.units import cm
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

try:
    from app.calculo_notas import calcular_notas_por_momento
    from app.database import obtener_conexion
except ImportError:
    from calculo_notas import calcular_notas_por_momento
    from database import obtener_conexion

# ====== Paleta compartida por los dos documentos ======
AZUL = colors.HexColor("#1F6AA5")
VERDE = colors.HexColor("#2E8B57")
BORDE = colors.HexColor("#B7C6D2")
CAJA_FONDO = colors.HexColor("#F2F6FA")
CAJA_BORDE = colors.HexColor("#D9E2EA")
GRIS_TEXTO = colors.HexColor("#5A6B78")
ZEBRA = colors.HexColor("#F4F8FB")
GRIS_TIPO = colors.HexColor("#33475B")

# Color del texto de cada tipo de actividad (misma paleta que el portal)
COLORES_TIPO = {
    "taller": AZUL,
    "quiz": colors.HexColor("#9A6B0A"),
    "examen": colors.HexColor("#B02A37"),
    "trabajo": colors.HexColor("#1F7A44"),
}
TIPO_LEGIBLE = {"taller": "Taller", "quiz": "Quiz", "examen": "Examen", "trabajo": "Trabajo"}


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


# ====== Piezas visuales comunes ======
def _estilos():
    base = getSampleStyleSheet()
    return {
        "titulo": ParagraphStyle("TituloPDF", parent=base["Title"], fontSize=17,
                                 textColor=AZUL, alignment=TA_CENTER, spaceAfter=2),
        "seccion": ParagraphStyle("SeccionPDF", parent=base["Heading2"], fontSize=12.5,
                                  textColor=AZUL, spaceBefore=12, spaceAfter=6),
        "nota": ParagraphStyle("NotaPDF", parent=base["Normal"], fontSize=8.5,
                               textColor=GRIS_TEXTO, spaceBefore=4),
        "pie": ParagraphStyle("PiePDF", parent=base["Normal"], fontSize=8,
                              textColor=GRIS_TEXTO, alignment=TA_CENTER, spaceBefore=12),
        "normal": base["Normal"],
    }

def _caja(lineas_html, estilos):
    """Caja clara con los datos del estudiante."""
    caja = Table([[Paragraph("<br/>".join(lineas_html), estilos["normal"])]],
                 colWidths=[15.5 * cm])
    caja.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CAJA_FONDO),
        ("BOX", (0, 0), (-1, -1), 0.6, CAJA_BORDE),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return caja

def _encabezado(titulo, lineas_html, estilos, color=AZUL):
    """Título centrado, línea de color y caja con los datos del estudiante."""
    return [
        Paragraph(titulo, estilos["titulo"]),
        HRFlowable(width="100%", thickness=1.2, color=color, spaceBefore=4, spaceAfter=10),
        _caja(lineas_html, estilos),
        Spacer(1, 0.4 * cm),
    ]

def _estilo_tabla(color_encabezado, extra=None):
    """Estilo común: encabezado de color, filas cebra y relleno cómodo."""
    estilo = [
        ("BACKGROUND", (0, 0), (-1, 0), color_encabezado),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDE),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ZEBRA]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if extra:
        estilo.extend(extra)
    return TableStyle(estilo)

def _pie(estilos):
    """Línea final con la fecha de generación."""
    return Paragraph(
        f"Generado el {datetime.now().strftime('%Y-%m-%d %H:%M')} · Campus UCC · Gestión académica",
        estilos["pie"],
    )


def generar_pdf_notas(cedula):
    """ Genera el boletín de calificaciones de un estudiante.

    Incluye las notas de materia y, en una sección aparte, las calificaciones
    de tareas (taller, quiz, examen o trabajo) con el título de cada actividad.
    La nota que cuenta es la de la entrega más reciente de cada tarea.
    """
    estudiante = _estudiante(cedula)
    if not estudiante:
        return False, "El estudiante no existe."

    # Una sola consulta: materias matriculadas + sus notas a mano (si ya existen)
    conn = obtener_conexion()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT m.id_matricula, mat.nombre_curso, n.id_nota, n.nota1, n.nota2,
                       n.nota3, n.definitiva, n.estado
                FROM matriculas m
                JOIN materias mat ON mat.id_materia = m.id_materia
                LEFT JOIN notas n ON n.id_matricula = m.id_matricula
                WHERE m.cedula = %s
                ORDER BY mat.nombre_curso
                """,
                (cedula,),
            )
            filas = cur.fetchall()
            # Notas calculadas desde las tareas con momento, solo para las
            # matrículas sin notas a mano (esas tienen prioridad y no se tocan)
            calculos = calcular_notas_por_momento(cur, cedula)
    finally:
        conn.close()

    # Calificaciones de tareas: la entrega más reciente calificada de cada actividad
    actividades = _consulta(
        """
        SELECT nombre_curso, titulo, tipo, calificacion, subida_en
        FROM (
            SELECT DISTINCT ON (t.id_tarea) mat.nombre_curso, t.titulo, t.tipo, e.calificacion, e.subida_en
            FROM entregas e
            JOIN tareas t ON t.id_tarea = e.id_tarea
            JOIN materias mat ON mat.id_materia = t.id_materia
            WHERE e.cedula = %s AND e.calificacion IS NOT NULL
            ORDER BY t.id_tarea, e.subida_en DESC
        ) calificaciones
        ORDER BY nombre_curso, subida_en DESC
        """,
        (cedula,),
    )

    datos_tabla = [["Materia", "N1", "N2", "N3", "Def", "Estado"]]
    hay_calculadas = False
    for id_matricula, nombre_materia, id_nota, n1, n2, n3, definitiva, estado in filas:
        if id_nota is not None:  # notas registradas a mano por el profesor: prioridad
            if n1 is None:
                datos_tabla.append([nombre_materia, "-", "-", "-", "-", "Sin notas"])
            else:
                datos_tabla.append([
                    nombre_materia,
                    f"{n1:.2f}", f"{n2:.2f}", f"{n3:.2f}",
                    f"{definitiva:.2f}", estado,
                ])
            continue
        # Matrícula sin notas a mano: N1/N2/N3 calculados por momento (V6)
        calculo = calculos.get(id_matricula)
        if calculo is None:
            datos_tabla.append([nombre_materia, "-", "-", "-", "-", "Sin notas"])
            continue
        hay_calculadas = True
        datos_tabla.append([
            nombre_materia,
            f"{calculo['nota1']:.2f}" if calculo["nota1"] is not None else "-",
            f"{calculo['nota2']:.2f}" if calculo["nota2"] is not None else "-",
            f"{calculo['nota3']:.2f}" if calculo["nota3"] is not None else "-",
            f"{calculo['definitiva']:.2f}" if calculo["definitiva"] is not None else "-",
            calculo["estado"],
        ])

    tabla = Table(datos_tabla, colWidths=[5*cm, 1.5*cm, 1.5*cm, 1.5*cm, 2*cm, 3*cm])
    tabla.setStyle(_estilo_tabla(AZUL, [
        ("FONTNAME", (4, 1), (4, -1), "Helvetica-Bold"),
    ]))

    estilos = _estilos()
    contenido = _encabezado(
        "Reporte de Notas Académicas",
        [f"<b>Estudiante:</b> {estudiante[0]} {estudiante[1]}", f"<b>Cédula:</b> {cedula}"],
        estilos,
    )
    contenido.append(Paragraph("Notas por materia", estilos["seccion"]))
    contenido.append(tabla)
    if hay_calculadas:
        contenido.append(Paragraph(
            "Para las materias sin notas registradas a mano, N1, N2 y N3 son el promedio de las "
            "calificaciones de tareas de cada momento (1, 2 o 3) y la definitiva es el promedio de "
            "los momentos con calificación; si solo hay uno, la definitiva es ese valor.",
            estilos["nota"],
        ))

    if actividades:
        datos_actividades = [["Materia", "Actividad", "Tipo", "Nota", "Calificada el"]]
        color_por_fila = []
        for nombre_materia, titulo, tipo, calificacion, subida_en in actividades:
            datos_actividades.append([
                nombre_materia,
                titulo,
                TIPO_LEGIBLE.get(tipo, tipo or "-"),
                f"{float(calificacion):.2f}",
                subida_en.strftime("%Y-%m-%d %H:%M") if subida_en else "-",
            ])
            color_por_fila.append(COLORES_TIPO.get(tipo, GRIS_TIPO))
        tabla_actividades = Table(
            datos_actividades,
            colWidths=[3.4*cm, 5.4*cm, 2.0*cm, 1.5*cm, 3.2*cm],
        )
        extras = [("TEXTCOLOR", (2, i), (2, i), color) for i, color in enumerate(color_por_fila, start=1)]
        extras.append(("FONTNAME", (3, 1), (3, -1), "Helvetica-Bold"))
        tabla_actividades.setStyle(_estilo_tabla(VERDE, extras))
        contenido.append(Paragraph("Calificaciones de tareas", estilos["seccion"]))
        contenido.append(tabla_actividades)
        contenido.append(Paragraph(
            "La nota corresponde a la entrega más reciente de cada actividad (taller, quiz, examen o trabajo).",
            estilos["nota"],
        ))
    else:
        contenido.append(Paragraph("Sin calificaciones de tareas registradas.", estilos["nota"]))

    contenido.append(_pie(estilos))
    archivo = f"Reporte_Notas_{cedula}.pdf"
    doc = SimpleDocTemplate(archivo, pagesize=letter)
    doc.build(contenido)
    return True, archivo

def generar_pdf_matricula(cedula, periodo=None):
    """ Genera el recibo de las materias matriculadas en UN periodo.

    El recibo se pide por periodo, no por cédula: muestra solo las materias
    de ese periodo y su total de créditos. El radicado es el del lote (V9)
    con el que se crearon esas matrículas (el más reciente si hubo varios
    lotes en el periodo); si no se indica periodo, se usa el más reciente
    con matrículas. Las matrículas anteriores a los lotes (sin id_lote) se
    marcan con un aviso, sin inventar radicado.
    """
    estudiante = _estudiante(cedula)
    if not estudiante:
        return False, "El estudiante no existe."

    if periodo is None:
        # Sin periodo explícito: el más reciente con matrículas de este estudiante
        filas_periodos = _consulta(
            "SELECT DISTINCT periodo FROM matriculas WHERE cedula = %s ORDER BY periodo DESC",
            (cedula,),
        )
        if not filas_periodos:
            return False, "El estudiante no tiene materias matriculadas."
        periodo = filas_periodos[0][0]

    filas = _consulta(
        """
        SELECT m.id_matricula, m.id_materia, mat.nombre_curso, m.creditos,
               m.periodo, m.fecha_matricula, m.id_lote
        FROM matriculas m
        JOIN materias mat ON mat.id_materia = m.id_materia
        WHERE m.cedula = %s AND m.periodo = %s
        ORDER BY m.fecha_matricula, m.id_matricula
        """,
        (cedula, periodo),
    )
    if not filas:
        return False, f"El estudiante no tiene materias matriculadas en el periodo '{periodo}'."

    # Radicado: el del lote (V9) de ESTE periodo; el más reciente si hubo varios.
    ids_lote = sorted({fila[6] for fila in filas if fila[6]})
    radicado = None
    fecha_recibo = filas[0][5]
    if ids_lote:
        lotes = _consulta(
            "SELECT id_lote, radicado, fecha FROM matriculas_lote "
            "WHERE id_lote = ANY(%s) ORDER BY fecha DESC",
            (ids_lote,),
        )
        radicado = lotes[0][1]
        fecha_recibo = lotes[0][2]
    sin_lote = any(fila[6] is None for fila in filas)

    datos_tabla = [["Código", "Materia", "Créditos", "Periodo"]]
    total_creditos = 0
    for id_matricula, id_materia, nombre_materia, creditos, periodo_fila, fecha, id_lote in filas:
        total_creditos += creditos
        datos_tabla.append([id_materia, nombre_materia, creditos, periodo_fila])
    datos_tabla.append(["", "TOTAL CRÉDITOS", total_creditos, ""])

    tabla = Table(datos_tabla, colWidths=[3*cm, 7*cm, 3*cm, 3*cm])
    tabla.setStyle(_estilo_tabla(VERDE, [
        ("FONTNAME", (1, -1), (-2, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#EAF5F3")),
    ]))

    estilos = _estilos()
    contenido = _encabezado(
        "Recibo de Matrícula",
        [
            f"<b>Estudiante:</b> {estudiante[0]} {estudiante[1]}",
            f"<b>Cédula:</b> {cedula}",
            f"<b>Radicado:</b> {radicado if radicado else 'Sin radicado'}",
            f"<b>Periodo:</b> {periodo}",
            f"<b>Fecha de matrícula:</b> {fecha_recibo}",
        ],
        estilos,
        color=VERDE,
    )
    contenido.append(Paragraph("Materias matriculadas", estilos["seccion"]))
    contenido.append(tabla)
    if sin_lote:
        contenido.append(Paragraph(
            "Nota: una o más matrículas de este periodo son anteriores a los lotes "
            "y no tienen radicado asignado.",
            estilos["nota"],
        ))
    if radicado and len(ids_lote) > 1:
        contenido.append(Paragraph(
            "Nota: este periodo tiene matrículas de varios lotes; se muestra el radicado del lote más reciente.",
            estilos["nota"],
        ))
    contenido.append(_pie(estilos))

    archivo = f"Recibo_Matricula_{cedula}.pdf"
    doc = SimpleDocTemplate(archivo, pagesize=letter)
    doc.build(contenido)
    return True, archivo
