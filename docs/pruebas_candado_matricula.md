# Pruebas del candado de requisitos y matrícula única por periodo (Parte 8)

Matriz ejecutada el **2026-11-19** contra la API en `http://localhost:8000` y el portal en `http://localhost:5173`, rama `feature/tablero-y-filtros` (base `ca1c80b`). Las credenciales se enviaron por los encabezados `X-Usuario` / `X-Clave` y **no se publican en este documento**.

## Alcance

- **Frontend (`frontend/app.js`, `frontend/styles.css`)**: las materias con `bloqueada: true` muestran un candado visible, el nombre y código del requisito faltante y un estilo `cursor: not-allowed`. No se pueden agregar al carrito por clic, teclado (Enter/Espacio), checkbox de la vista lista ni arrastrar y soltar. El carrito descarta las bloqueadas y el periodo del lote se toma de `GET /periodos/` (el periodo cuyas fechas contienen hoy), sin hardcodear `2026-2`.
- **Backend (`POST /matriculas/lote`)**: responde **409** si el estudiante ya tiene una matrícula `Activa` en el periodo solicitado, con el mensaje que remite a **adición o cancelación**. También responde **409** si tiene una matrícula `Activa` en un periodo cuyas fechas contienen hoy, con el mensaje de esperar a que termine el semestre. Cuando el periodo anterior ya terminó, el siguiente periodo abierto se puede matricular con normalidad.
- No se agregaron migraciones: V1–V9 quedan intactas y no se modificó `backend/.env`.

## Pruebas del backend (8/8)

La suite usó dos estudiantes temporales y tres periodos temporales; al final borró todo y comparó la base con la línea base.

| # | Prueba | Resultado real | Estado |
|---|--------|----------------|--------|
| R1 | Estudiante con matrícula activa en el periodo solicitado | **409** `"El estudiante '1001' ya tiene una matrícula activa en el periodo '2026-2'. Para modificarla, gestiona los cambios mediante adición o cancelación de materias."`; no insertó filas | OK |
| R2 | Primer lote de un estudiante temporal en un periodo abierto | **201**, 6 créditos, 2 matrículas, radicado de 8 caracteres | OK |
| R3 | Segundo lote del mismo estudiante y periodo | **409** con el mensaje de adición/cancelación; las 2 matrículas originales quedaron intactas | OK |
| R4 | Matrícula en curso en T26-B y lote para otro periodo abierto T26-A | **409** `"...tiene una matrícula en curso en el periodo 'T26-B' (finaliza el 2026-12-20); no puede volver a matricular por lote hasta que termine el semestre actual."`; no insertó filas | OK |
| R5 | El periodo anterior terminó (se movió la matrícula a T26-C, finalizado el 2026-11-18) | **201** en T26-B, 7 créditos y 2 matrículas nuevas | OK |
| R6 | Dos lotes simultáneos del mismo estudiante | Un **201** y un **409**; solo se insertaron las 2 materias del ganador (bloqueo `FOR UPDATE` del estudiante) | OK |
| R7 | Contrato del tablero | **200**, 13 materias, 19 campos; B05 bloqueada por `[{"id_materia":"B01","nombre_curso":"Cálculo 1"}]` y B01 libre | OK |
| L1 | Limpieza | La base quedó igual a la línea base (2 estudiantes, 4 matrículas, 2 notas, 15 tareas, 33 materias, plan 34, 7 requisitos, 0 lotes, 1 periodo) | OK |

**Resultado: 8 de 8 pruebas pasaron.**

## Regresión focalizada de las validaciones del lote (10/10)

Para comprobar que las reglas anteriores siguen funcionando cuando la nueva regla no bloquea la solicitud, se usaron estudiantes, un periodo y una materia temporales. Todos los casos negativos verificaron que no se insertara ninguna matrícula ni cabecera.

| # | Prueba | Resultado real | Estado |
|---|--------|----------------|--------|
| R1 | Materia de otro programa | **422** `"Materias fuera del plan de estudios..."`; 0 filas | OK |
| R2 | B05 sin Cálculo 1 aprobado | **422** `"Requisitos previos sin aprobar: 'Cálculo 2' requiere 'Cálculo 1'..."`; 0 filas | OK |
| R3 | Materia temporal con un solo cupo | Primer estudiante **201** con 7 créditos; segundo **409** `"no tiene cupos disponibles..."`; 0 filas del perdedor | OK |
| R4a | Menos de 6 créditos | **422** con el rango 6–19; 0 filas | OK |
| R4b | Materia repetida en el carrito | **409** `"El carrito tiene materias repetidas"`; 0 filas | OK |
| R4c | Materia inexistente | **404** `"Una o más materias del carrito no existen"`; 0 filas | OK |
| R4d | Cruce de horario B01/B02 (miércoles 14:00–16:00) | **422** `"Cruce de horario..."`; 0 filas | OK |
| R5 | Lote válido | **201**, 7 créditos, radicado único de 8 mayúsculas, cabecera en `matriculas_lote` y 2 matrículas con el mismo `id_lote` | OK |
| R5b | Recibo PDF del periodo | **200**, PDF válido y radicado visible en el texto | OK |
| L1 | Limpieza | Base igual a la línea base | OK |

**Resultado: 10 de 10 pruebas pasaron.**

## Verificación en el portal

Con la cuenta de estudiante del plan de Sistemas:

- El tablero mostró **13 materias** y **3 bloqueadas**: B05 (Cálculo 1), IS03 (Programación 2) e IS05 (Bases de Datos).
- B05 mostró la insignia `🔒 Bloqueada`, el texto `Falta: Cálculo 1 (B01)`, `aria-disabled="true"`, `draggable="false"` y `cursor: not-allowed`.
- Un clic, Enter, Espacio, un evento `drop` o marcar el checkbox de la vista lista **no aumentaron el carrito**; el aviso explicó el requisito faltante.
- La vista lista muestra las bloqueadas con borde discontinuo, checkbox `disabled` y el requisito faltante.
- El pie mostró `Periodo 2026-2 · entre 6 y 19 créditos`; con el carrito vacío el botón `Matricular selección` quedó deshabilitado.
- Consola del navegador: **0 errores**.

## Suites de regresión que siguen pasando

| Suite | Resultado |
|-------|-----------|
| Requisitos faltantes en el tablero | **7/7** |
| Edición del plan por el administrador | **16/16** |
| PDF de notas y recibo | **14/14** |

Las suites antiguas que hacían **varios lotes consecutivos de 1001 en 2026-2** (Partes 1–5) quedaron obsoletas por el cambio solicitado: el segundo lote ahora recibe **409** y ya no llega a las validaciones de plan, cupos o requisitos. Por eso la cobertura de esas validaciones se revalidó con la regresión focalizada anterior, usando estudiantes y periodos limpios.

## Estado final

- `1001`: 4 matrículas y 2 notas; `2001`: 0 matrículas.
- 2 estudiantes, 33 materias, 34 filas de plan, 7 requisitos, 15 tareas, 0 lotes y 1 periodo (`2026-2`).
- Sin estudiantes, periodos, materias, matrículas, notas ni PDFs temporales.
- No se modificaron PostgreSQL, `backend/.env`, migraciones existentes ni las funcionalidades de las Partes A/B.
