// ====== Tipos del dominio: espejo exacto de lo que devuelve la API ======

export type Rol = 'Administrador' | 'Estudiante' | 'Profesor';

// ====== Sesion ======
export interface Sesion {
  usuario: string;
  rol: Rol;
  id_persona: string | null;
  debe_cambiar_clave: boolean;
}

// ====== Catalogos ======
export interface Facultad {
  id_facultad: string;
  nombre_facultad: string;
}

export interface Programa {
  id_programa: string;
  nombre_programa: string;
  id_facultad: string;
  plan_referencia?: boolean;
}

export interface Profesor {
  id_profesor: string;
  nombre: string;
  apellidos: string;
}

export interface Materia {
  id_materia: string;
  nombre_curso: string;
  creditos: number;
  cupos: number;
  id_facultad: string;
  horario: string | null;
  id_profesor: string;
  dia: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
}

export interface Estudiante {
  id_estudiante: string;
  nombre: string;
  apellidos: string;
  correo: string;
  telefono: string | null;
  semestre: number;
  id_programa: string;
}

export interface Periodo {
  periodo: string;
  fecha_inicio: string;
  fecha_fin: string;
}

// ====== Materias disponibles (tablero del estudiante) ======
export interface RequisitoFaltante {
  id_materia: string;
  nombre_curso: string;
}

export interface MateriaDisponible {
  id_estudiante: string;
  id_programa: string;
  id_facultad: string;
  id_materia: string;
  nombre_curso: string;
  creditos: number;
  cupos: number;
  horario: string | null;
  id_profesor: string;
  dia: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  semestre: number;
  obligatoria: boolean;
  estado: 'Aprobada' | 'Matriculada' | 'Disponible' | 'Bloqueada';
  bloqueada: boolean;
  requisitos_faltantes: RequisitoFaltante[];
}

// ====== Matriculas ======
export interface Matricula {
  id_matricula: string;
  cedula: string;
  id_materia: string;
  creditos: number;
  periodo: string;
  fecha_matricula: string;
  estado: string;
  id_lote: string | null;
}

export interface MatriculaLoteRespuesta {
  cedula: string;
  periodo: string;
  total_creditos: number;
  radicado: string;
  matriculas: { id_matricula: string; id_materia: string; creditos: number }[];
}

// ====== Registro academico por periodo ======
export interface MateriaHistorial {
  id_matricula: string;
  id_materia: string;
  nombre_curso: string;
  creditos: number;
  calificacion: number | null;
  nota_final: number | null;
  estado: 'Cursando' | 'Aprobada' | 'Reprobada' | 'Sin nota';
}

export interface HistorialPeriodo {
  cedula: string;
  periodo: string;
  periodo_abierto: boolean;
  materias: MateriaHistorial[];
  promedio_semestre: number | null;
  promedio_acumulado: number | null;
}

// ====== Notas ======
export interface ActividadCalificada {
  titulo: string;
  tipo: string;
  calificacion: number;
  subida_en: string;
}

export interface Nota {
  id_nota: string | null;
  id_matricula: string;
  id_materia: string;
  nota1: number | null;
  nota2: number | null;
  nota3: number | null;
  definitiva: number | null;
  estado: string | null;
  calculada: boolean;
  actividades?: ActividadCalificada[];
}

// ====== Tareas ======
export interface Tarea {
  id_tarea: string;
  id_materia: string;
  materia: string;
  titulo: string;
  descripcion: string;
  fecha_limite: string;
  tiene_apoyo: boolean;
  creada_en: string;
  tipo: 'taller' | 'quiz' | 'examen' | 'trabajo';
  momento: number | null;
  estado_entrega?: 'Entregado' | 'Pendiente' | 'No entregó';
  fecha_entrega?: string;
  calificacion?: number | null;
  entregas_recibidas?: number;
  matriculados?: number;
}

// ====== Recuperacion de clave ======
export interface RecuperacionRespuesta {
  mensaje: string;
  modo?: 'correo' | 'desarrollo';
  token?: string;
}
