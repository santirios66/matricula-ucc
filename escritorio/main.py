# ==========================================
# ARCHIVO: main.py
# FUNCIÓN: Ejecutable principal con menú mejorado y logo incluido
# ==========================================

import customtkinter as ctk
from PIL import Image
from pathlib import Path
import gestion_usuarios as usr
import mi_cuenta

# Conectamos nuestras otras piezas del rompecabezas
import db_postgres as db
import formularios as forms
import autenticacion as auth

ctk.set_appearance_mode("light")
ctk.set_default_color_theme("blue")

class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Sistema de Matrícula - UCC")
        self.update_idletasks()
        
        # Tamaño de la ventana ajustado para que se vea el diseño de login y menú perfectamente
        ancho, alto = 800, 550
        x = (self.winfo_screenwidth() // 2) - (ancho // 2)
        y = (self.winfo_screenheight() // 2) - (alto // 2)
        self.geometry(f"{ancho}x{alto}+{x}+{y}")
        self.resizable(False, False) # Bloqueamos maximizar para cuidar el diseño
        
        self.frame_actual = None 
        self.mostrar_login()

    def limpiar_pantalla(self):
        if self.frame_actual: 
            self.frame_actual.destroy()

    def mostrar_login(self):
        self.limpiar_pantalla()
        self.frame_actual = auth.dibujar_login(self, self.mostrar_menu)

    def mostrar_menu(self, rol, usuario):
        self.limpiar_pantalla()
        
        # Fondo morado general (igual al del login)
        self.frame_actual = ctk.CTkScrollableFrame(self, fg_color="#3B1C7A", corner_radius=0)
        self.frame_actual.pack(expand=True, fill="both")

        # Tarjeta Blanca Central
        tarjeta = ctk.CTkFrame(self.frame_actual, fg_color="white", corner_radius=25)
        tarjeta.pack(pady=40, padx=20, expand=True)

        # ===============================================
        # AQUÍ CARGAMOS EL LOGO PARA EL MENÚ
        # ===============================================
        ruta_logo = Path(__file__).parent / "logo_ucc.png"
        if ruta_logo.exists():
            imagen_ucc = ctk.CTkImage(light_image=Image.open(ruta_logo), size=(90, 90))
            ctk.CTkLabel(tarjeta, image=imagen_ucc, text="").pack(pady=(20, 5))

        # Títulos con la letra Century Gothic elegante
        ctk.CTkLabel(tarjeta, text="UNIVERSIDAD COOPERATIVA DE COLOMBIA", font=("Century Gothic", 18, "bold"), text_color="#1F6AA5").pack(pady=(5, 5))
        ctk.CTkLabel(tarjeta, text=f"Panel de Control: {rol}", font=("Century Gothic", 14), text_color="gray").pack(pady=(0, 20))

        frame_grid = ctk.CTkFrame(tarjeta, fg_color="transparent")
        frame_grid.pack(pady=10, padx=20)
        
        # Estilo de botones celestes y redondeados
        estilo = {"width": 220, "height": 45, "corner_radius": 15, "font": ("Century Gothic", 13, "bold"), "fg_color": "#36B5C6", "hover_color": "#2A919F"}

        # === BOTONES SEGÚN EL ROL ===
        if rol == "Administrador":
            ctk.CTkButton(frame_grid, text="Registrar Facultad", command=forms.abrir_ventana_facultad, **estilo).grid(row=0, column=0, padx=10, pady=10)
            ctk.CTkButton(frame_grid, text="Registrar Programa", command=forms.abrir_ventana_programa, **estilo).grid(row=0, column=1, padx=10, pady=10)
            ctk.CTkButton(frame_grid, text="Registrar Materia", command=forms.abrir_ventana_materia, **estilo).grid(row=1, column=0, padx=10, pady=10)
            ctk.CTkButton(frame_grid, text="Registrar Estudiante", command=forms.abrir_ventana_estudiante, **estilo).grid(row=1, column=1, padx=10, pady=10)
            ctk.CTkButton(frame_grid, text="Cuenta Estudiante", command=usr.crear_cuenta_estudiante, **estilo).grid(row=2, column=0, padx=10, pady=10)
            ctk.CTkButton(frame_grid, text="Cuenta Profesor", command=usr.crear_cuenta_profesor, **estilo).grid(row=2, column=1, padx=10, pady=10)
            ctk.CTkButton(frame_grid, text="Restablecer Clave", command=usr.restablecer_clave, **estilo).grid(row=3, column=0, padx=10, pady=10)

        elif rol == "Estudiante":
            ctk.CTkButton(frame_grid, text="Matricular Materia", command=lambda: forms.abrir_ventana_matricula(usuario), **estilo).grid(row=0, column=0, padx=10, pady=10)
            ctk.CTkButton(frame_grid, text="Imprimir Documentos", command=lambda: forms.pedir_cedula_pdf(usuario, rol), **estilo).grid(row=0, column=1, padx=10, pady=10)
            
        elif rol == "Profesor":
            ctk.CTkButton(frame_grid, text="Ingresar Notas", command=lambda: forms.abrir_ventana_notas(usuario), **estilo).grid(row=0, column=0, padx=10, pady=10)
            ctk.CTkButton(frame_grid, text="Imprimir Reportes", command=lambda: forms.pedir_cedula_pdf(usuario, rol), **estilo).grid(row=0, column=1, padx=10, pady=10)
        
        ctk.CTkButton(tarjeta, text="Cambiar mi Contraseña", command=lambda: mi_cuenta.cambiar_mi_clave(usuario),
                    width=220, height=40, corner_radius=15, font=("Century Gothic", 13, "bold"),
                    fg_color="#1F6AA5", hover_color="#154B75").pack(pady=(15, 0))
        # Botón Cerrar Sesión
        ctk.CTkButton(tarjeta, text="Cerrar Sesión", command=self.mostrar_login, width=200, height=40, fg_color="#D9534F", hover_color="#c9302c", corner_radius=15, font=("Century Gothic", 13, "bold")).pack(pady=(20, 30))

if __name__ == "__main__": 
    app = App()
    app.mainloop()