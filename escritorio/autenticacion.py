# ==========================================
# ARCHIVO: autenticacion.py
# FUNCIÓN: Login contra la tabla usuarios de PostgreSQL + cambio obligatorio de clave.
# ==========================================

import customtkinter as ctk
from tkinter import messagebox
from PIL import Image, ImageDraw
from pathlib import Path

import db_postgres as db
from seguridad import verificar_clave, crear_hash

def crear_avatar_automatico():
    img = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse((0, 0, 100, 100), fill="#F0F0F0")
    draw.ellipse((30, 18, 70, 58), fill="#1F6AA5")
    draw.ellipse((15, 65, 85, 140), fill="#1F6AA5")
    return img

def pedir_cambio_clave(usuario, al_terminar):
    """ Ventana obligatoria: no se puede cerrar hasta que la clave quede cambiada. """
    vent = ctk.CTkToplevel()
    vent.title("Cambiar contraseña")
    vent.geometry("380x360")
    vent.configure(fg_color="white")
    vent.attributes("-topmost", True)
    vent.grab_set()                              # bloquea la ventana de atrás
    vent.protocol("WM_DELETE_WINDOW", lambda: None)  # la X no cierra nada

    ctk.CTkLabel(vent, text="Debes cambiar tu contraseña", font=("Century Gothic", 16, "bold"), text_color="#1F6AA5").pack(pady=(25, 5))
    ctk.CTkLabel(vent, text="Es tu primer ingreso. Mínimo 8 caracteres.", font=("Century Gothic", 11), text_color="gray").pack(pady=(0, 15))

    estilo = {"width": 280, "height": 40, "fg_color": "#EEEEEE", "text_color": "black", "border_width": 0, "corner_radius": 8, "show": "*"}
    caja_nueva = ctk.CTkEntry(vent, placeholder_text="Nueva contraseña", **estilo)
    caja_nueva.pack(pady=5)
    caja_repite = ctk.CTkEntry(vent, placeholder_text="Repite la contraseña", **estilo)
    caja_repite.pack(pady=5)

    def guardar():
        nueva = caja_nueva.get()
        repite = caja_repite.get()
        if len(nueva) < 8:
            return messagebox.showwarning("Error", "La contraseña debe tener mínimo 8 caracteres.", parent=vent)
        if nueva != repite:
            return messagebox.showwarning("Error", "Las contraseñas no coinciden.", parent=vent)
        sal, password_hash = crear_hash(nueva)
        db.actualizar_clave(usuario, sal, password_hash, debe_cambiar=False)
        vent.grab_release()
        vent.destroy()
        al_terminar()

    ctk.CTkButton(vent, text="Guardar contraseña", command=guardar, width=280, height=40, font=("Century Gothic", 14, "bold"), fg_color="#1F6AA5", hover_color="#154B75", corner_radius=8).pack(pady=25)

def dibujar_login(contenedor, funcion_exito):
    frame_fondo = ctk.CTkFrame(contenedor, fg_color="#3B1C7A", corner_radius=0)
    frame_fondo.pack(expand=True, fill="both")

    tarjeta = ctk.CTkFrame(frame_fondo, fg_color="white", corner_radius=15, width=750, height=480)
    tarjeta.place(relx=0.5, rely=0.5, anchor="center")
    tarjeta.pack_propagate(False)

    # MITAD IZQUIERDA (AZUL OSCURO - Logo con base blanca)
    frame_izq = ctk.CTkFrame(tarjeta, fg_color="#1F6AA5", corner_radius=15, width=330)
    frame_izq.pack(side="left", fill="y", padx=10, pady=10)
    frame_izq.pack_propagate(False)

    frame_logo = ctk.CTkFrame(frame_izq, fg_color="white", corner_radius=15)
    frame_logo.pack(pady=(40, 20))

    ruta_logo = Path(__file__).parent / "logo_ucc.png"
    if ruta_logo.exists():
        imagen_ucc = ctk.CTkImage(light_image=Image.open(ruta_logo), size=(150, 150))
        ctk.CTkLabel(frame_logo, image=imagen_ucc, text="").pack(padx=15, pady=10)

    ctk.CTkLabel(frame_izq, text="Bienvenido a...", font=("Century Gothic", 26, "bold"), text_color="white").pack(anchor="w", padx=30, pady=(0, 5))
    ctk.CTkLabel(frame_izq, text="SISTEMA ACADÉMICO UCC", font=("Century Gothic", 14, "bold"), text_color="#E0F7FA").pack(anchor="w", padx=30, pady=(0, 15))

    descripcion = (
        "Esta plataforma centralizada te\n"
        "permite gestionar tu semestre:\n\n"
        "• Realizar matrícula de materias.\n"
        "• Registrar y consultar notas.\n"
        "• Generar reportes en PDF."
    )
    ctk.CTkLabel(frame_izq, text=descripcion, font=("Century Gothic", 12), text_color="white", justify="left").pack(anchor="w", padx=30)
    ctk.CTkLabel(frame_izq, text="Universidad Cooperativa de Colombia", font=("Century Gothic", 10), text_color="white").pack(side="bottom", pady=20)

    # MITAD DERECHA (BLANCO - Formulario y Avatar)
    frame_der = ctk.CTkFrame(tarjeta, fg_color="white")
    frame_der.pack(side="right", fill="both", expand=True, padx=30, pady=10)

    img_avatar = ctk.CTkImage(light_image=crear_avatar_automatico(), size=(70, 70))
    ctk.CTkLabel(frame_der, image=img_avatar, text="").pack(pady=(15, 5))

    ctk.CTkLabel(frame_der, text="Iniciar Sesión", font=("Century Gothic", 24, "bold"), text_color="#1F6AA5").pack(pady=(0, 20))

    fuente_cajas = ("Century Gothic", 12)

    ctk.CTkLabel(frame_der, text="Usuario *", font=("Century Gothic", 11, "bold"), text_color="#A0A0A0").pack(anchor="w", padx=25)
    caja_usuario = ctk.CTkEntry(frame_der, placeholder_text="Escribe tu usuario", font=fuente_cajas, width=280, height=40, fg_color="#EEEEEE", text_color="black", border_width=1, border_color="#DDDDDD", corner_radius=8)
    caja_usuario.pack(pady=(2, 15))

    ctk.CTkLabel(frame_der, text="Contraseña *", font=("Century Gothic", 11, "bold"), text_color="#A0A0A0").pack(anchor="w", padx=25)
    caja_pass = ctk.CTkEntry(frame_der, placeholder_text="Escribe tu contraseña", show="*", font=fuente_cajas, width=280, height=40, fg_color="#EEEEEE", text_color="black", border_width=1, border_color="#DDDDDD", corner_radius=8)
    caja_pass.pack(pady=(2, 25))

    def verificar_credenciales():
        user = caja_usuario.get().strip()
        pwd = caja_pass.get().strip()
        fila = db.obtener_usuario(user) if user else None

        if fila and verificar_clave(pwd, fila[1], fila[2]):
            rol = fila[3]
            debe_cambiar = fila[5]
            if debe_cambiar:
                pedir_cambio_clave(user, lambda: funcion_exito(rol, user))
            else:
                funcion_exito(rol, user)
        else:
            messagebox.showerror("Acceso Denegado", "Usuario o contraseña incorrectos.")

    ctk.CTkButton(frame_der, text="LOGIN", command=verificar_credenciales, width=280, height=40, font=("Century Gothic", 14, "bold"), fg_color="#1F6AA5", hover_color="#154B75", corner_radius=8).pack(pady=(0, 15))
    ctk.CTkButton(frame_der, text="Salir del programa", command=contenedor.destroy, fg_color="transparent", text_color="gray", hover_color="#F0F0F0", font=("Century Gothic", 11, "underline")).pack()

    return frame_fondo