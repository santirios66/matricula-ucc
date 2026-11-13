# Sistema de Matrícula Académica: UCC

Sistema de matrícula, notas y reportes académicos para la Universidad Cooperativa de Colombia, Sede Cali. Proyecto del curso de Ingeniería de Software, desarrollado por **Santiago Patiño Ríos** y **Jairo Enrique Arboleda Trujillo**.

El proyecto empezó como una aplicación de escritorio en Python con Tkinter y Excel. Luego se migró a PostgreSQL y se separó en una API REST con FastAPI, con control de acceso por rol. El portal web es el frontend de la API.

---

## Estado del proyecto

| Componente | Carpeta | Estado |
|---|---|---|
| API REST (FastAPI + PostgreSQL) | `backend/` | Completa: catálogos, matrículas, notas, autenticación, PDF y control de acceso |
| Portal web | `frontend/` | En integración: consume la API para catálogos |
| Aplicación de escritorio (Tkinter) | `escritorio/` | Referencia de la versión original |

---

## Funcionalidades por rol

| Rol | Qué puede hacer |
|---|---|
| **Administrador** | Registrar facultades, programas, materias, profesores y estudiantes. Crear cuentas y restablecer claves. Consultar todo. |
| **Estudiante** | Ver sus matrículas y notas. Consultar las materias disponibles de su programa. Matricular varias materias en un solo paso. Descargar su recibo y su reporte de notas. |
| **Profesor** | Registrar notas de las materias que dicta. Ver las matrículas y notas de sus materias. Descargar reportes de los estudiantes matriculados en ellas. |
| **Todos** | Cambiar su propia clave. |

---

## Reglas de negocio

- **Créditos por periodo:** entre 6 y 19. Se valida al guardar el carrito completo, en una sola transacción.
- **Materias disponibles:** el estudiante solo ve las materias de la facultad a la que pertenece su programa.
- **Sin repetir materia:** no se puede matricular la misma materia dos veces en el mismo periodo.
- **Notas:** tres notas entre 0.0 y 5.0. La definitiva es el promedio. Es **Aprobado** con 3.0 o más.
- **Sin nota duplicada:** cada matrícula tiene una sola nota.
- **Identidad:** cada usuario solo accede a sus propios datos. Un estudiante no puede ver las matrículas ni los PDF de otro.
- **Catálogos:** solo el administrador puede crear facultades, programas, materias, profesores y estudiantes.
- **Claves:** se guardan con hash PBKDF2-SHA256 y sal. Las cuentas nuevas reciben una clave temporal y deben cambiarla en el primer ingreso.

---

## Estructura del repositorio
