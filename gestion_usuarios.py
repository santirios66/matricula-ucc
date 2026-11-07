# ==========================================
# ARCHIVO: gestion_usuarios.py
# FUNCIÓN: Ventanas del admin para crear cuentas y restablecer claves.
# ==========================================

import customtkinter as ctk
from tkinter import messagebox

import db_postgres as db
from seguridad import generar_clave_temporal, crear_hash
from formularios import crear_ventana_base, estilo_caja, agregar_botones_accion

def mostrar_clave_una_vez(usuario, clave):
    """ Muestra la clave temporal en pantalla. Solo se ve en esta ventana. """
    vent = crear_ventana_base("Clave temporal", 380, 280)
    ctk.CTkLabel(vent, text="Clave temporal lista", font=("Roboto", 18, "bold"), text_color="#36B5C6").pack(pady=(20, 10))
    ctk.CTkLabel(vent, text=f"Usuario: {usuario}", font=("Roboto", 14)).pack(pady=4)
    ctk.CTkLabel(vent, text=f"Clave: {clave}", font=("Roboto", 16, "bold"), text_color="#1F6AA5").pack(pady=4)
    ctk.CTkLabel(vent, text="Entrégala ahora. No se volverá a mostrar.\nAl entrar, el usuario debe cambiarla.",
                 font=("Roboto", 12), text_color="gray", justify="center").pack(pady=10)
    ctk.CTkButton(vent, text="Listo", command=vent.destroy, width=120, height=40, corner_radius=20,
                  font=("Roboto", 14, "bold"), fg_color="#36B5C6", hover_color="#2A919F", text_color="white").pack(pady=10)

def crear_cuenta_estudiante():
    ops = db.obtener_opciones("estudiantes", "id_estudiante", "nombre")
    if not ops:
        return messagebox.showwarning("Aviso", "Registre primero un estudiante.")

    vent = crear_ventana_base("Cuenta de Estudiante", 400, 300)
    ctk.CTkLabel(vent, text="Cuenta de Estudiante", font=("Roboto", 18, "bold"), text_color="#36B5C6").pack(pady=15)
    ctk.CTkLabel(vent, text="El usuario será su cédula.", font=("Roboto", 12), text_color="gray").pack()

    combo = ctk.CTkComboBox(vent, values=ops, width=280, height=40, fg_color="#EEEEEE", text_color="black", border_width=0, corner_radius=15)
    combo.pack(pady=15)

    def guardar():
        cedula = db.extraer_id(combo.get())
        if db.existe("usuarios", "usuario", cedula):
            return messagebox.showwarning("Aviso", "Ese estudiante ya tiene cuenta.", parent=vent)
        clave = generar_clave_temporal()
        sal, password_hash = crear_hash(clave)
        db.insertar(
            "usuarios",
            ["usuario", "sal", "password_hash", "rol", "id_persona", "debe_cambiar_clave"],
            [cedula, sal, password_hash, "Estudiante", cedula, True],
        )
        vent.destroy()
        mostrar_clave_una_vez(cedula, clave)

    agregar_botones_accion(vent, guardar)

def crear_cuenta_profesor():
    vent = crear_ventana_base("Cuenta de Profesor", 400, 340)
    ctk.CTkLabel(vent, text="Cuenta de Profesor", font=("Roboto", 18, "bold"), text_color="#36B5C6").pack(pady=15)

    caja_usuario = ctk.CTkEntry(vent, **estilo_caja("Usuario (Ej: profe.perez)"))
    caja_usuario.pack(pady=8)
    caja_id = ctk.CTkEntry(vent, **estilo_caja("ID del profesor (Ej: PR01)"))
    caja_id.pack(pady=8)

    def guardar():
        usuario = caja_usuario.get().strip()
        id_prof = caja_id.get().strip()
        if not usuario or not id_prof:
            return messagebox.showwarning("Error", "Llene todos los campos.", parent=vent)
        if db.existe("usuarios", "usuario", usuario):
            return messagebox.showwarning("Aviso", "Ese usuario ya existe.", parent=vent)
        clave = generar_clave_temporal()
        sal, password_hash = crear_hash(clave)
        db.insertar(
            "usuarios",
            ["usuario", "sal", "password_hash", "rol", "id_persona", "debe_cambiar_clave"],
            [usuario, sal, password_hash, "Profesor", id_prof, True],
        )
        vent.destroy()
        mostrar_clave_una_vez(usuario, clave)

    agregar_botones_accion(vent, guardar)

def restablecer_clave():
    vent = crear_ventana_base("Restablecer Clave", 400, 280)
    ctk.CTkLabel(vent, text="Restablecer contraseña", font=("Roboto", 18, "bold"), text_color="#36B5C6").pack(pady=15)

    caja_usuario = ctk.CTkEntry(vent, **estilo_caja("Usuario a restablecer"))
    caja_usuario.pack(pady=10)

    def guardar():
        usuario = caja_usuario.get().strip()
        if not db.existe("usuarios", "usuario", usuario):
            return messagebox.showwarning("Aviso", "Ese usuario no existe.", parent=vent)
        clave = generar_clave_temporal()
        sal, password_hash = crear_hash(clave)
        db.actualizar_clave(usuario, sal, password_hash, debe_cambiar=True)
        vent.destroy()
        mostrar_clave_una_vez(usuario, clave)

    agregar_botones_accion(vent, guardar)