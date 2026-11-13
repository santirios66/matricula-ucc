# ==========================================
# ARCHIVO: routers/pdf.py
# FUNCIÓN: Endpoints de PDF (matrícula y notas).
# Reutiliza pdf_reportes.py; no escribe SQL nuevo.
# ==========================================

from fastapi import APIRouter, Depends, HTTPException, Path, status
from fastapi.responses import FileResponse

try:
    from app.database import obtener_conexion
    from app.pdf_reportes import generar_pdf_matricula, generar_pdf_notas
    from app.seguridad_api import ROL_ADMIN, ROL_PROFESOR, autenticar
except ImportError:
    from database import obtener_conexion
    from pdf_reportes import generar_pdf_matricula, generar_pdf_notas
    from seguridad_api import ROL_ADMIN, ROL_PROFESOR, autenticar

router = APIRouter(prefix="/pdf", tags=["pdf"])


def _cedula_limpia(cedula: str) -> str:
    cedula = cedula.strip()
    if not cedula:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La cédula no puede estar vacía",
        )
    return cedula


def _verificar_permiso_pdf(cedula: str, sesion: dict):
    """Estudiante solo su cédula, profesor solo estudiantes de sus materias, admin todo."""
    if sesion["rol"] == ROL_ADMIN:
        return
    if sesion["rol"] == ROL_PROFESOR:
        conn = obtener_conexion()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM matriculas m JOIN materias mat ON mat.id_materia = m.id_materia "
                    "WHERE m.cedula = %s AND mat.id_profesor = %s LIMIT 1",
                    (cedula, sesion["id_persona"]),
                )
                if cur.fetchone() is None:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"No tienes estudiantes matriculados con la cédula '{cedula}' en tus materias",
                    )
        finally:
            conn.close()
        return
    # Estudiante
    if cedula != sesion["id_persona"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo puedes consultar tus propios reportes",
        )


@router.get("/matricula/{cedula}", status_code=status.HTTP_200_OK)
def descargar_pdf_matricula(cedula: str = Path(..., min_length=1), sesion: dict = Depends(autenticar)):
    """Genera el recibo de matrícula y lo devuelve como archivo PDF (según rol)."""
    cedula = _cedula_limpia(cedula)
    _verificar_permiso_pdf(cedula, sesion)
    ok, archivo_o_mensaje = generar_pdf_matricula(cedula)
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
def descargar_pdf_notas(cedula: str = Path(..., min_length=1), sesion: dict = Depends(autenticar)):
    """Genera el boletín de notas y lo devuelve como archivo PDF (según rol)."""
    cedula = _cedula_limpia(cedula)
    _verificar_permiso_pdf(cedula, sesion)
    ok, archivo_o_mensaje = generar_pdf_notas(cedula)
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
