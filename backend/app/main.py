# ==========================================
# ARCHIVO: main.py
# FUNCIÓN: Punto de entrada de la API FastAPI.
# Se arranca desde backend/ con: uvicorn app.main:app --reload
# ==========================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from app.routers.facultades import router as facultades_router
    from app.routers.programas import router as programas_router
    from app.routers.materias import router as materias_router
    from app.routers.profesores import router as profesores_router
    from app.routers.estudiantes import router as estudiantes_router
    from app.routers.matriculas import router as matriculas_router
except ImportError:
    from routers.facultades import router as facultades_router
    from routers.programas import router as programas_router
    from routers.materias import router as materias_router
    from routers.profesores import router as profesores_router
    from routers.estudiantes import router as estudiantes_router
    from routers.matriculas import router as matriculas_router

app = FastAPI(title="Matrícula Universitaria API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(facultades_router)
app.include_router(programas_router)
app.include_router(materias_router)
app.include_router(profesores_router)
app.include_router(estudiantes_router)
app.include_router(matriculas_router)


@app.get("/health")
def salud():
    return {"estado": "ok"}


@app.get("/")
def raiz():
    return {"mensaje": "API de Matrícula Universitaria en funcionamiento"}
