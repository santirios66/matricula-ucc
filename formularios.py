# ==========================================
# ARCHIVO: formularios.py
# FUNCIÓN: Todas las ventanas del sistema, guardando en PostgreSQL.
# ==========================================

import uuid
import psycopg2
from tkinter import messagebox
import customtkinter as ctk
import db_postgres as db
import pdf_reportes as pdf

def crear_ventana_base(titulo, ancho, alto):
    vent = ctk.CTkToplevel()
    vent.update_idletasks()
    x = (vent.winfo_screenwidth() // 2) - (ancho // 2)
    y = (vent.winfo_screenheight() // 2) - (alto // 2)
    vent.geometry(f"{ancho}x{alto}+{x}+{y}")
    vent.title(titulo)
    vent.configure(fg_color="white")
    vent.attributes("-topmost", True)
    return vent

def estilo_caja(placeholder):
    return {"placeholder_text": placeholder, "width": 280, "height": 40, "fg_color": "#EEEEEE", "text_color": "black", "border_width": 0, "corner_radius": 15}

def agregar_botones_accion(ventana, comando_guardar):
    frame_btn = ctk.CTkFrame(ventana, fg_color="transparent")
    frame_btn.pack(pady=20)
    ctk.CTkButton(frame_btn, text="Guardar", command=comando_guardar, width=120, height=40, corner_radius=20, font=("Roboto", 14, "bold"), fg_color="#36B5C6", hover_color="#2A919F", text_color="white").pack(side="left", padx=10)
    ctk.CTkButton(frame_btn, text="Cancelar", command=ventana.destroy, width=120, height=40, corner_radius=20, font=("Roboto", 14, "bold"), fg_color="#EEEEEE", hover_color="#DDDDDD", text_color="black").pack(side="right", padx=10)

# ---------- FACULTAD ----------
def abrir_ventana_facultad():
    vent = crear_ventana_base("Registrar Facultad", 400, 300)
    ctk.CTkLabel(vent, text="Registro de Facultad", font=("Roboto", 18, "bold"), text_color="#36B5C6").pack(pady=15)

    c_id = ctk.CTkEntry(vent, **estilo_caja("ID Facultad (Ej: F01)"))
    c_id.pack(pady=10)
    c_nom = ctk.CTkEntry(vent, **estilo_caja("Nombre Facultad"))
    c_nom.pack(pady=10)

    def guardar():
        id_fac = c_id.get().strip()
        nombre = c_nom.get().strip()
        if not id_fac or not nombre:
            return messagebox.showwarning("Error", "Llene todos los campos.")
        if db.existe("facultades", "id_facultad", id_fac):
            return messagebox.showwarning("Error", "El ID ya existe.")
        db.insertar("facultades", ["id_facultad", "nombre_facultad"], [id_fac, nombre])
        messagebox.showinfo("Éxito", "Facultad registrada.")
        vent.destroy()

    agregar_botones_accion(vent, guardar)

# ---------- PROGRAMA ----------
def abrir_ventana_programa():
    ops = db.obtener_opciones("facultades", "id_facultad", "nombre_facultad")
    if not ops: return messagebox.showwarning("Aviso", "Registre una Facultad primero.")

    vent = crear_ventana_base("Registrar Programa", 400, 350)
    ctk.CTkLabel(vent, text="Registro de Programa", font=("Roboto", 18, "bold"), text_color="#36B5C6").pack(pady=15)

    c_id = ctk.CTkEntry(vent, **estilo_caja("ID Programa (Ej: P01)"))
    c_id.pack(pady=10)
    c_nom = ctk.CTkEntry(vent, **estilo_caja("Nombre Programa"))
    c_nom.pack(pady=10)
    combo_fac = ctk.CTkComboBox(vent, values=ops, width=280, height=40, fg_color="#EEEEEE", text_color="black", border_width=0, corner_radius=15)
    combo_fac.pack(pady=10)

    def guardar():
        id_prog = c_id.get().strip()
        nombre = c_nom.get().strip()
        if not id_prog or not nombre:
            return messagebox.showwarning("Error", "Llene todos los campos.")
        if db.existe("programas", "id_programa", id_prog):
            return messagebox.showwarning("Error", "El Programa ya existe.")
        db.insertar("programas", ["id_programa", "nombre_programa", "id_facultad"], [id_prog, nombre, db.extraer_id(combo_fac.get())])
        messagebox.showinfo("Éxito", "Programa registrado.")
        vent.destroy()

    agregar_botones_accion(vent, guardar)

# ---------- MATERIA ----------
def abrir_ventana_materia():
    ops = db.obtener_opciones("facultades", "id_facultad", "nombre_facultad")
    ops_prof = db.obtener_opciones("profesores", "id_profesor", "nombre")
    if not ops: return messagebox.showwarning("Aviso", "Registre una Facultad primero.")
    if not ops_prof: return messagebox.showwarning("Aviso", "Registre primero un profesor (cuenta de profesor con su ID).")

    vent = crear_ventana_base("Registrar Materia", 400, 560)
    ctk.CTkLabel(vent, text="Registro de Materia", font=("Roboto", 18, "bold"), text_color="#36B5C6").pack(pady=15)

    c_id = ctk.CTkEntry(vent, **estilo_caja("ID Materia (Ej: M04)"))
    c_id.pack(pady=5)
    c_nom = ctk.CTkEntry(vent, **estilo_caja("Nombre Materia"))
    c_nom.pack(pady=5)
    c_cred = ctk.CTkEntry(vent, **estilo_caja("Créditos (Ej: 3)"))
    c_cred.pack(pady=5)
    c_cupos = ctk.CTkEntry(vent, **estilo_caja("Cupos Totales (Ej: 20)"))
    c_cupos.pack(pady=5)
    c_horario = ctk.CTkEntry(vent, **estilo_caja("Horario (Ej: Lun 8-10am)"))
    c_horario.pack(pady=5)

    ctk.CTkLabel(vent, text="Facultad", font=("Roboto", 11, "bold"), text_color="gray").pack(anchor="w", padx=60)
    combo_fac = ctk.CTkComboBox(vent, values=ops, width=280, height=40, fg_color="#EEEEEE", text_color="black", border_width=0, corner_radius=15)
    combo_fac.pack(pady=(2, 8))

    ctk.CTkLabel(vent, text="Profesor", font=("Roboto", 11, "bold"), text_color="gray").pack(anchor="w", padx=60)
    combo_prof = ctk.CTkComboBox(vent, values=ops_prof, width=280, height=40, fg_color="#EEEEEE", text_color="black", border_width=0, corner_radius=15)
    combo_prof.pack(pady=(2, 8))

    def guardar():
        id_mat = c_id.get().strip()
        nombre = c_nom.get().strip()
        if not id_mat or not nombre or not c_cred.get().strip() or not c_horario.get().strip():
            return messagebox.showwarning("Error", "Llene todos los campos.")
        try:
            creditos = int(c_cred.get().strip())
            cupos = int(c_cupos.get().strip() or 20)
        except ValueError:
            return messagebox.showwarning("Error", "Créditos y cupos deben ser números.")
        if creditos <= 0:
            return messagebox.showwarning("Error", "Los créditos deben ser mayores a 0.")
        if db.existe("materias", "id_materia", id_mat):
            return messagebox.showwarning("Error", "La Materia ya existe.")
        db.insertar(
            "materias",
            ["id_materia", "nombre_curso", "creditos", "cupos", "id_facultad", "horario", "id_profesor"],
            [id_mat, nombre, creditos, cupos, db.extraer_id(combo_fac.get()), c_horario.get().strip(), db.extraer_id(combo_prof.get())],
        )
        messagebox.showinfo("Éxito", "Materia registrada.")
        vent.destroy()

    agregar_botones_accion(vent, guardar)

# ---------- ESTUDIANTE ----------
def abrir_ventana_estudiante():
    ops_prog = db.obtener_opciones("programas", "id_programa", "nombre_programa")
    if not ops_prog: return messagebox.showwarning("Aviso", "Registre primero un Programa.")

    vent = crear_ventana_base("Registrar Estudiante", 450, 520)
    ctk.CTkLabel(vent, text="Registro de Estudiante", font=("Roboto", 18, "bold"), text_color="#36B5C6").pack(pady=15)

    c_ced = ctk.CTkEntry(vent, **estilo_caja("Cédula"))
    c_ced.pack(pady=5)
    c_nom = ctk.CTkEntry(vent, **estilo_caja("Nombres"))
    c_nom.pack(pady=5)
    c_ape = ctk.CTkEntry(vent, **estilo_caja("Apellidos"))
    c_ape.pack(pady=5)
    c_cor = ctk.CTkEntry(vent, **estilo_caja("Correo Electrónico"))
    c_cor.pack(pady=5)
    c_tel = ctk.CTkEntry(vent, **estilo_caja("Teléfono"))
    c_tel.pack(pady=5)
    c_sem = ctk.CTkEntry(vent, **estilo_caja("Semestre (Ej: 4)"))
    c_sem.pack(pady=5)
    combo_prog = ctk.CTkComboBox(vent, values=ops_prog, width=280, height=40, fg_color="#EEEEEE", text_color="black", border_width=0, corner_radius=15)
    combo_prog.pack(pady=10)

    def guardar():
        ced = c_ced.get().strip()
        nom = c_nom.get().strip()
        ape = c_ape.get().strip()
        cor = c_cor.get().strip()
        sem = c_sem.get().strip()
        if not ced or not nom or not ape or not cor or not sem:
            return messagebox.showwarning("Error", "Todos los campos son obligatorios.")
        try:
            semestre = int(sem)
        except ValueError:
            return messagebox.showwarning("Error", "El semestre debe ser un número.")
        if db.existe("estudiantes", "id_estudiante", ced):
            return messagebox.showwarning("Error", "El estudiante ya existe.")
        db.insertar(
            "estudiantes",
            ["id_estudiante", "nombre", "apellidos", "correo", "telefono", "semestre", "id_programa"],
            [ced, nom, ape, cor, c_tel.get().strip(), semestre, db.extraer_id(combo_prog.get())],
        )
        messagebox.showinfo("Éxito", "Estudiante guardado.")
        vent.destroy()

    agregar_botones_accion(vent, guardar)

# ---------- MATRÍCULA (carrito) ----------
def abrir_ventana_matricula(cedula):
    """ Matrícula del estudiante logueado. La cédula viene de la sesión, no de un combo. """
    fila_est = db.consultar("SELECT nombre, apellidos FROM estudiantes WHERE id_estudiante = %s", (cedula,))
    if not fila_est:
        return messagebox.showerror("Error", "Tu usuario no está ligado a un estudiante registrado.")
    nombre_completo = f"{fila_est[0][0]} {fila_est[0][1]}"

    info = {}      # materias disponibles para su programa
    carrito = []

    vent = crear_ventana_base("Matrícula Académica", 520, 760)
    ctk.CTkLabel(vent, text="Matrícula de Materias", font=("Roboto", 18, "bold"), text_color="#36B5C6").pack(pady=(15, 8))

    frame_info = ctk.CTkFrame(vent, fg_color="#E8F6F8", corner_radius=12)
    frame_info.pack(padx=30, pady=(0, 10), fill="x")
    instrucciones = (
        "¿Cómo matricular?\n"
        "1. Escribe el periodo (Ej: 2026-2).\n"
        "2. Elige una materia de tu programa y pulsa \"Agregar al carrito\".\n"
        "3. Revisa los horarios en el carrito para que no se te crucen.\n"
        "4. El total debe estar entre 6 y 19 créditos (verde = válido, rojo = no válido).\n"
        "5. Pulsa \"Guardar\" para confirmar la matrícula."
    )
    ctk.CTkLabel(frame_info, text=instrucciones, font=("Roboto", 12), text_color="#1F4E5A", justify="left", wraplength=440).pack(padx=12, pady=8, anchor="w")

    ctk.CTkLabel(vent, text="1. Datos de la matrícula", font=("Roboto", 13, "bold"), text_color="gray").pack(anchor="w", padx=60)
    ctk.CTkLabel(vent, text=f"Estudiante: {nombre_completo} ({cedula})", font=("Roboto", 13, "bold"), text_color="#1F6AA5").pack(pady=(3, 8))
    caja_periodo = ctk.CTkEntry(vent, **{**estilo_caja("Periodo (Ej: 2026-2)"), "width": 350})
    caja_periodo.pack(pady=(0, 12))

    ctk.CTkLabel(vent, text="2. Elige tus materias", font=("Roboto", 13, "bold"), text_color="gray").pack(anchor="w", padx=60)
    combo_materia = ctk.CTkComboBox(vent, values=["Cargando..."], width=350, height=40, fg_color="#EEEEEE", text_color="black", border_width=0, corner_radius=15)
    combo_materia.pack(pady=(3, 5))

    lbl_total = ctk.CTkLabel(vent, text="", font=("Roboto", 13, "bold"))

    def redibujar():
        for w in frame_carrito.winfo_children():
            w.destroy()
        if not carrito:
            ctk.CTkLabel(frame_carrito, text="Aún no hay materias en el carrito.", text_color="gray").pack(pady=10)
        for item in carrito:
            fila = ctk.CTkFrame(frame_carrito, fg_color="white")
            fila.pack(fill="x", pady=2, padx=4)
            ctk.CTkLabel(fila, text=f"{item['id']} - {item['nombre']} ({item['creditos']} cr)\n{item['horario']}", font=("Roboto", 11), justify="left").pack(side="left", padx=5)
            ctk.CTkButton(fila, text="Quitar", width=60, height=28, fg_color="#D9534F", hover_color="#c9302c", command=lambda i=item: quitar(i)).pack(side="right", padx=5)
        total = sum(i["creditos"] for i in carrito)
        ok = 6 <= total <= 19
        lbl_total.configure(text=f"Total: {total} créditos (entre 6 y 19)", text_color="#2E8B57" if ok else "#D9534F")

    def cargar_materias():
        # Solo materias de la facultad a la que pertenece su programa
        filas = db.consultar(
            "SELECT mat.id_materia, mat.nombre_curso, mat.creditos, mat.horario "
            "FROM estudiantes e "
            "JOIN programas p ON p.id_programa = e.id_programa "
            "JOIN materias mat ON mat.id_facultad = p.id_facultad "
            "WHERE e.id_estudiante = %s ORDER BY mat.id_materia",
            (cedula,),
        )
        info.clear()
        for id_mat, nombre, creditos, horario in filas:
            info[id_mat] = {"nombre": nombre, "creditos": creditos, "horario": horario or "Sin horario"}
        if filas:
            opciones = [f"{r[0]} - {r[1]}" for r in filas]
            combo_materia.configure(values=opciones)
            combo_materia.set(opciones[0])
        else:
            combo_materia.configure(values=["Sin materias para su programa"])
            combo_materia.set("Sin materias para su programa")

    def agregar_al_carrito():
        id_mat = db.extraer_id(combo_materia.get())
        if id_mat not in info:
            return messagebox.showwarning("Aviso", "Esta materia no pertenece a tu programa.")
        if any(i["id"] == id_mat for i in carrito):
            return messagebox.showwarning("Aviso", "Ya agregaste esta materia.")
        datos = info[id_mat]
        carrito.append({"id": id_mat, "nombre": datos["nombre"], "creditos": datos["creditos"], "horario": datos["horario"]})
        redibujar()

    def quitar(item):
        carrito.remove(item)
        redibujar()

    ctk.CTkButton(vent, text="➕ Agregar al carrito", command=agregar_al_carrito, fg_color="#F0AD4E", hover_color="#EC971F", text_color="black", width=200).pack(pady=(0, 12))

    ctk.CTkLabel(vent, text="3. Tu carrito", font=("Roboto", 13, "bold"), text_color="gray").pack(anchor="w", padx=60)
    frame_carrito = ctk.CTkScrollableFrame(vent, width=420, height=110, fg_color="#F9F9F9")
    frame_carrito.pack(pady=5)
    lbl_total.pack(pady=5)

    def guardar():
        periodo = caja_periodo.get().strip()
        total = sum(i["creditos"] for i in carrito)
        if not periodo: return messagebox.showwarning("Error", "Ingrese el periodo.")
        if not carrito: return messagebox.showwarning("Error", "Agrega al menos una materia.")
        if total < 6: return messagebox.showerror("Error", "Debes matricular un MÍNIMO de 6 créditos.")
        if total > 19: return messagebox.showerror("Error", "Superas el límite de 19 créditos.")

        for item in carrito:
            ya = db.consultar("SELECT 1 FROM matriculas WHERE cedula = %s AND id_materia = %s AND periodo = %s", (cedula, item["id"], periodo))
            if ya:
                return messagebox.showwarning("Aviso", f"Ya tienes {item['id']} en el periodo {periodo}.")

        for item in carrito:
            db.insertar(
                "matriculas",
                ["id_matricula", "cedula", "id_materia", "creditos", "periodo"],
                [str(uuid.uuid4())[:8], cedula, item["id"], item["creditos"], periodo],
            )
        messagebox.showinfo("Éxito", f"Has matriculado {len(carrito)} materias con éxito.")
        vent.destroy()

    cargar_materias()
    redibujar()
    agregar_botones_accion(vent, guardar)

# ---------- NOTAS ----------
def abrir_ventana_notas(usuario):
    """ Notas del profesor logueado: solo sus materias y solo estudiantes matriculados en ellas. """
    fila_usr = db.obtener_usuario(usuario)
    id_prof = fila_usr[4] if fila_usr else None
    if not id_prof:
        return messagebox.showerror("Error", "Tu usuario no está ligado a un profesor.")

    mis_materias = db.consultar(
        "SELECT id_materia, nombre_curso FROM materias WHERE id_profesor = %s ORDER BY id_materia",
        (id_prof,),
    )
    if not mis_materias:
        return messagebox.showwarning("Aviso", "No tienes materias asignadas.")

    opciones_mat = [f"{r[0]} - {r[1]}" for r in mis_materias]
    estudiantes_map = {}  # etiqueta del combo -> id_matricula

    vent = crear_ventana_base("Ingresar Notas", 420, 600)
    ctk.CTkLabel(vent, text="Registro de Notas", font=("Roboto", 18, "bold"), text_color="#36B5C6").pack(pady=15)

    ctk.CTkLabel(vent, text="1. Elige una de tus materias", font=("Roboto", 13, "bold"), text_color="gray").pack(anchor="w", padx=60)
    combo_materia = ctk.CTkComboBox(vent, values=opciones_mat, width=320, height=40, fg_color="#EEEEEE", text_color="black",
                                    border_width=0, corner_radius=15,
                                    command=lambda sel: cargar_estudiantes(db.extraer_id(sel)))
    combo_materia.pack(pady=(3, 12))

    ctk.CTkLabel(vent, text="2. Elige el estudiante", font=("Roboto", 13, "bold"), text_color="gray").pack(anchor="w", padx=60)
    combo_est = ctk.CTkComboBox(vent, values=["Elige una materia primero"], width=320, height=40, fg_color="#EEEEEE", text_color="black",
                                border_width=0, corner_radius=15)
    combo_est.pack(pady=(3, 12))

    ctk.CTkLabel(vent, text="3. Notas (de 0.0 a 5.0)", font=("Roboto", 13, "bold"), text_color="gray").pack(anchor="w", padx=60)
    f_notas = ctk.CTkFrame(vent, fg_color="transparent")
    f_notas.pack(pady=8)
    cajas = []
    for i in range(1, 4):
        c = ctk.CTkEntry(f_notas, placeholder_text=f"Nota {i}", width=80, height=40)
        c.pack(side="left", padx=5)
        cajas.append(c)

    def cargar_estudiantes(id_mat):
        filas = db.consultar(
            "SELECT m.id_matricula, m.cedula, e.nombre, e.apellidos "
            "FROM matriculas m JOIN estudiantes e ON e.id_estudiante = m.cedula "
            "WHERE m.id_materia = %s ORDER BY e.apellidos, e.nombre",
            (id_mat,),
        )
        estudiantes_map.clear()
        opciones = []
        for id_matricula, cedula, nombre, apellidos in filas:
            etiqueta = f"{cedula} - {nombre} {apellidos}"
            estudiantes_map[etiqueta] = id_matricula
            opciones.append(etiqueta)
        if opciones:
            combo_est.configure(values=opciones)
            combo_est.set(opciones[0])
        else:
            combo_est.configure(values=["Sin estudiantes matriculados"])
            combo_est.set("Sin estudiantes matriculados")

    combo_materia.set(opciones_mat[0])
    cargar_estudiantes(db.extraer_id(opciones_mat[0]))

    def guardar():
        id_mat = db.extraer_id(combo_materia.get())
        if id_mat not in [r[0] for r in mis_materias]:
            return messagebox.showerror("Error", "Esa materia no es tuya.")

        etiqueta = combo_est.get()
        if etiqueta not in estudiantes_map:
            return messagebox.showwarning("Error", "Elige un estudiante matriculado en esa materia.")
        id_matricula = estudiantes_map[etiqueta]

        try:
            notas = [float(c.get().strip().replace(",", ".")) for c in cajas]
        except ValueError:
            return messagebox.showwarning("Error", "Ingrese valores numéricos (Ej: 4.5)")
        if any(n < 0.0 or n > 5.0 for n in notas):
            return messagebox.showwarning("Error", "Las notas deben estar entre 0.0 y 5.0")

        if db.existe("notas", "id_matricula", id_matricula):
            return messagebox.showwarning("Aviso", "Esta materia ya tiene notas registradas para ese estudiante.")

        definitiva = round(sum(notas) / 3, 2)
        estado = "Aprobado" if definitiva >= 3.0 else "Reprobado"
        db.insertar(
            "notas",
            ["id_nota", "id_matricula", "id_materia", "nota1", "nota2", "nota3", "definitiva", "estado"],
            [str(uuid.uuid4())[:8], id_matricula, id_mat, notas[0], notas[1], notas[2], definitiva, estado],
        )
        messagebox.showinfo("Éxito", f"Notas guardadas. Definitiva: {definitiva} ({estado})")
        vent.destroy()

    agregar_botones_accion(vent, guardar)

# ---------- PDFs ----------
def pedir_cedula_pdf(usuario=None, rol=None):
    """ Estudiante: su propia cédula, sin combo. Profesor: solo estudiantes de sus materias. """
    if rol == "Profesor":
        fila_usr = db.obtener_usuario(usuario)
        id_prof = fila_usr[4] if fila_usr else None
        ops_est = db.consultar(
            "SELECT DISTINCT e.id_estudiante, e.nombre, e.apellidos FROM matriculas m "
            "JOIN materias mat ON mat.id_materia = m.id_materia "
            "JOIN estudiantes e ON e.id_estudiante = m.cedula "
            "WHERE mat.id_profesor = %s ORDER BY e.apellidos, e.nombre",
            (id_prof,),
        )
        opciones = [f"{r[0]} - {r[1]} {r[2]}" for r in ops_est]
        if not opciones: return messagebox.showwarning("Aviso", "No hay estudiantes matriculados en tus materias.")
        cedula_fija = None
    else:
        cedula_fija = usuario
        opciones = None

    vent = crear_ventana_base("Imprimir Documentos", 400, 320)
    ctk.CTkLabel(vent, text="Generador de PDFs", font=("Roboto", 18, "bold"), text_color="#36B5C6").pack(pady=15)

    tipo_pdf = ctk.CTkComboBox(vent, values=["Recibo de Matrícula", "Reporte de Notas"], width=280, height=40, fg_color="#EEEEEE", text_color="black", border_width=0, corner_radius=15)
    tipo_pdf.pack(pady=10)

    combo_cedula = None
    if cedula_fija is None:
        combo_cedula = ctk.CTkComboBox(vent, values=opciones, width=280, height=40, fg_color="#EEEEEE", text_color="black", border_width=0, corner_radius=15)
        combo_cedula.pack(pady=10)
    else:
        ctk.CTkLabel(vent, text=f"Documentos de la cédula {cedula_fija}", font=("Roboto", 13, "bold"), text_color="#1F6AA5").pack(pady=10)

    def generar():
        ced = cedula_fija if cedula_fija is not None else db.extraer_id(combo_cedula.get())
        if tipo_pdf.get() == "Reporte de Notas":
            ok, resultado = pdf.generar_pdf_notas(ced)
        else:
            ok, resultado = pdf.generar_pdf_matricula(ced)
        if ok:
            messagebox.showinfo("Éxito", f"PDF generado: {resultado}")
            vent.destroy()
        else:
            messagebox.showwarning("Aviso", resultado)

    agregar_botones_accion(vent, generar)