# ==========================================
# ARCHIVO: mi_cuenta.py
# FUNCIÓN: Permite a cualquier usuario cambiar SU propia contraseña (pide la actual).
# ==========================================

import customtkinter as ctk
from tkinter import messagebox

import db_postgres as db
from seguridad import verificar_clave, crear_hash
from formularios import crear_ventana_base, estilo_caja, agregar_botones_accion

def cambiar_mi_clave(usuario):
    vent = crear_ventana_base("Cambiar mi contraseña", 400, 380)
    ctk.CTkLabel(vent, text="Cambiar mi contraseña", font=("Roboto", 18, "bold"), text_color="#36B5C6").pack(pady=15)

    caja_actual = ctk.CTkEntry(vent, **{**estilo_caja("Contraseña actual"), "show": "*"})
    caja_actual.pack(pady=6)
    caja_nueva = ctk.CTkEntry(vent, **{**estilo_caja("Nueva contraseña (mínimo 8)"), "show": "*"})
    caja_nueva.pack(pady=6)
    caja_repite = ctk.CTkEntry(vent, **{**estilo_caja("Repite la nueva contraseña"), "show": "*"})
    caja_repite.pack(pady=6)

    def guardar():
        actual = caja_actual.get()
        nueva = caja_nueva.get()
        repite = caja_repite.get()

        fila = db.obtener_usuario(usuario)
        if not fila or not verificar_clave(actual, fila[1], fila[2]):
            return messagebox.showerror("Error", "La contraseña actual no es correcta.", parent=vent)
        if len(nueva) < 8:
            return messagebox.showwarning("Error", "La nueva contraseña debe tener mínimo 8 caracteres.", parent=vent)
        if nueva != repite:
            return messagebox.showwarning("Error", "Las contraseñas nuevas no coinciden.", parent=vent)
        if nueva == actual:
            return messagebox.showwarning("Error", "La nueva contraseña debe ser distinta a la actual.", parent=vent)

        sal, password_hash = crear_hash(nueva)
        db.actualizar_clave(usuario, sal, password_hash, debe_cambiar=False)
        messagebox.showinfo("Listo", "Tu contraseña fue cambiada.", parent=vent)
        vent.destroy()

    agregar_botones_accion(vent, guardar)