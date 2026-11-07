# ==========================================
# ARCHIVO: routers/pdf.py
# FUNCIÓN: Endpoints de PDF (matrícula y notas).
# Reutiliza pdf_reportes.py; no escribe SQL nuevo.
# ==========================================

from fastapi import APIRouter, HTTPException, Path, status
from fastapi.responses import FileResponse

try:
    from app.pdf_reportes import generar_pdf_matricula, generar_pdf_notas
except ImportError:
    from pdf_reportes import generar_pdf_matricula, generar_pdf_notas

router = APIRouter(prefix="/pdf", tags=["pdf"])


def _cedula_limpia(cedula: str) -> str:
    cedula = cedula.strip()
    if not cedula:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La cédula no puede estar vacía",
        )
    return cedula


@router.get("/matricula/{cedula}", status_code=status.HTTP_200_OK)
def descargar_pdf_matricula(cedula: str = Path(..., min_length=1)):
    """Genera el recibo de matrícula y lo devuelve como archivo PDF."""
    ok, archivo_o_mensaje = generar_pdf_matricula(_cedula_limpia(cedula))
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=archivo_o_mensaje,
        )
    return FileResponse(
        path=archivo_o_mensaje,
        media_type="application/pdf",
        filename=archivo_o_mensaje,
    )


@router.get("/notas/{cedula}", status_code=status.HTTP_200_OK)
def descargar_pdf_notas(cedula: str = Path(..., min_length=1)):
    """Genera el boletín de notas y lo devuelve como archivo PDF."""
    ok, archivo_o_mensaje = generar_pdf_notas(_cedula_limpia(cedula))
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=archivo_o_mensaje,
        )
    return FileResponse(
        path=archivo_o_mensaje,
        media_type="application/pdf",
        filename=archivo_o_mensaje,
    )
