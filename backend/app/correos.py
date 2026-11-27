# ==========================================
# ARCHIVO: correos.py
# FUNCION: Envio de correos por SMTP leyendo la configuracion de backend/.env.
# Sin SMTP_HOST configurado entra en modo desarrollo: devuelve False y la
# API imprime el codigo de recuperacion en consola para poder probar el flujo.
# ==========================================

import os
import smtplib
from email.header import Header
from email.mime.text import MIMEText
from pathlib import Path

from dotenv import load_dotenv

# backend/.env -> este archivo vive en backend/app/
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def smtp_configurado():
    """True si hay servidor SMTP en las variables de entorno."""
    return bool(os.getenv("SMTP_HOST"))


def enviar_correo(destinatario, asunto, cuerpo):
    """Envia el correo y devuelve True si se envio.

    Devuelve False en modo desarrollo (sin SMTP) o si el envio falla;
    en ese caso la API no interrumpe la recuperacion: el codigo queda
    disponible en la consola para pruebas.
    """
    if not smtp_configurado():
        return False
    try:
        mensaje = MIMEText(cuerpo, "plain", "utf-8")
        mensaje["Subject"] = Header(asunto, "utf-8")
        remitente = os.getenv("SMTP_FROM") or os.getenv("SMTP_USER")
        mensaje["From"] = remitente
        mensaje["To"] = destinatario
        with smtplib.SMTP(os.getenv("SMTP_HOST"), int(os.getenv("SMTP_PORT", "587")), timeout=10) as servidor:
            servidor.starttls()
            servidor.login(os.getenv("SMTP_USER"), os.getenv("SMTP_PASS"))
            servidor.sendmail(remitente, [destinatario], mensaje.as_string())
        return True
    except Exception as error:
        print(f"[correos] no se pudo enviar a {destinatario}: {error}")
        return False
