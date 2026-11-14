# ==========================================
# ARCHIVO: almacenamiento.py
# FUNCIÓN: Guardar y descargar los archivos de tareas y entregas
# (backend/archivos/). El nombre SIEMPRE se genera con uuid4 y la
# extensión permitida; nunca se usa el nombre que manda el cliente.
# Tipos permitidos: PDF, MP4 y WebM. Máximo 20 MB medidos leyendo
# el archivo en el servidor, no confiando en los encabezados.
# ==========================================

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

# backend/archivos/ (este archivo vive en backend/app/)
CARPETA_ARCHIVOS = Path(__file__).resolve().parent.parent / "archivos"

# (content_type, extensión) que se aceptan: el tipo Y la extensión deben coincidir.
TIPOS_PERMITIDOS = {
    "application/pdf": ".pdf",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
}

# 20 MB
TAMANO_MAXIMO = 20 * 1024 * 1024

_BLOQUE = 1024 * 1024  # se lee el archivo en bloques de 1 MB


def extension_de_tipo(content_type: str) -> str:
    """Devuelve la extensión permitida para un tipo de contenido, o None."""
    return TIPOS_PERMITIDOS.get((content_type or "").strip().lower())


def validar_archivo(archivo: UploadFile, campo: str = "archivo") -> str:
    """Valida tipo de contenido, extensión y tamaño máximo.

    Devuelve la extensión permitida (con punto). Lanza 422 si algo falla.
    """
    if archivo is None or not archivo.filename:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"El campo '{campo}' es obligatorio",
        )
    extension = extension_de_tipo(archivo.content_type)
    if extension is None:
        permitidos = ", ".join(sorted(TIPOS_PERMITIDOS.values()))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Tipo de archivo no permitido '{archivo.content_type}'; "
                f"solo se aceptan {permitidos} (PDF, MP4 o WebM)"
            ),
        )
    # La extensión del nombre del cliente también debe coincidir con el tipo.
    sufijo = Path(archivo.filename).suffix.lower()
    if sufijo != extension:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"La extensión '{sufijo or 'sin extensión'}' no coincide con el tipo "
                f"'{archivo.content_type}'; se esperaba '{extension}'"
            ),
        )
    # El tamaño se mide leyendo el archivo en el servidor, no por el encabezado.
    tamano = 0
    while True:
        bloque = archivo.file.read(_BLOQUE)
        if not bloque:
            break
        tamano += len(bloque)
        if tamano > TAMANO_MAXIMO:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"El archivo supera el máximo de 20 MB "
                    f"(medidos en el servidor: {tamano / (1024 * 1024):.1f} MB)"
                ),
            )
    archivo.file.seek(0)
    return extension


def guardar_archivo(archivo: UploadFile, extension: str) -> str:
    """Guarda el archivo con nombre uuid4 + extensión y devuelve ese nombre."""
    CARPETA_ARCHIVOS.mkdir(exist_ok=True)
    nombre = f"{uuid.uuid4()}{extension}"
    destino = CARPETA_ARCHIVOS / nombre
    with destino.open("wb") as salida:
        while True:
            bloque = archivo.file.read(_BLOQUE)
            if not bloque:
                break
            salida.write(bloque)
    return nombre


def ruta_de(nombre: str) -> Path:
    """Ruta absoluta de un archivo guardado, validando que el nombre sea seguro."""
    if Path(nombre).name != nombre or nombre.startswith("."):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Archivo no encontrado",
        )
    return CARPETA_ARCHIVOS / nombre


def media_type_de(nombre: str) -> str:
    """Content type según la extensión del archivo guardado."""
    for tipo, extension in TIPOS_PERMITIDOS.items():
        if nombre.lower().endswith(extension):
            return tipo
    return "application/octet-stream"
