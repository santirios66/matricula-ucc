-- ==========================================================
-- ARCHIVO: poblar_datos.sql
-- FUNCION: Carga datos de prueba en la base (equivale a poblar_datos.py).
-- Requiere haber corrido antes crear_tablas.sql.
-- Es seguro correrlo varias veces: no duplica filas.
-- ==========================================================

-- 1) Facultad
INSERT INTO facultades (id_facultad, nombre_facultad)
VALUES ('F01', 'Ingeniería')
ON CONFLICT (id_facultad) DO NOTHING;

-- 2) Programa
INSERT INTO programas (id_programa, nombre_programa, id_facultad)
VALUES ('P01', 'Ingeniería de Sistemas', 'F01')
ON CONFLICT (id_programa) DO NOTHING;

-- 3) Profesores
INSERT INTO profesores (id_profesor, nombre, apellidos)
VALUES
    ('PR01', 'Carlos', 'Perez'),
    ('PR02', 'Ana', 'Gomez'),
    ('PR03', 'Luis', 'Martinez')
ON CONFLICT (id_profesor) DO NOTHING;

-- 4) Materias (3, para probar la suma de créditos en el carrito)
INSERT INTO materias (id_materia, nombre_curso, creditos, cupos, id_facultad, horario, id_profesor)
VALUES
    ('M01', 'Programación en Java',        4, 20, 'F01', 'Lunes 8:00am - 10:00am',           'PR01'),
    ('M02', 'Bases de Datos Relacionales', 3, 20, 'F01', 'Martes y Jueves 10:00am - 12:00m', 'PR02'),
    ('M03', 'Análisis Numérico',           3, 20, 'F01', 'Viernes 2:00pm - 5:00pm',          'PR03')
ON CONFLICT (id_materia) DO NOTHING;

-- 5) Estudiante de prueba
INSERT INTO estudiantes (id_estudiante, nombre, apellidos, correo, telefono, semestre, id_programa)
VALUES ('1001', 'Santiago', 'Patiño Ríos', 'santiago.patino@ucc.edu.co', '3000000000', 4, 'P01')
ON CONFLICT (id_estudiante) DO NOTHING;

-- Comprobación: cuántas filas quedaron en cada tabla
SELECT 'facultades'  AS tabla, COUNT(*) AS filas FROM facultades
UNION ALL SELECT 'programas',   COUNT(*) FROM programas
UNION ALL SELECT 'profesores',  COUNT(*) FROM profesores
UNION ALL SELECT 'materias',    COUNT(*) FROM materias
UNION ALL SELECT 'estudiantes', COUNT(*) FROM estudiantes
UNION ALL SELECT 'matriculas',  COUNT(*) FROM matriculas
UNION ALL SELECT 'notas',       COUNT(*) FROM notas
UNION ALL SELECT 'usuarios',    COUNT(*) FROM usuarios;