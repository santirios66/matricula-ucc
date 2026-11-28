import { useEffect, useState } from 'react';
import { getAuth, get } from '../api/client';
import type { Rol, Nota, Tarea, Estudiante, Materia, Periodo, Matricula } from '../api/types';

interface ResumenProps {
  rol: Rol;
  cedula: string | null;
  onNavegar?: (seccion: string) => void;
}

interface Stats {
  tareas: number;
  pendientes: number;
  entregadas: number;
  notas: number;
  promedio: number | null;
  materias: number;
  estudiantes: number;
  periodos: number;
}

const formatoFecha = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  } catch {
    return '—';
  }
};

export default function Resumen({ rol, cedula, onNavegar }: ResumenProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [nombre, setNombre] = useState('');
  const [tareaProxima, setTareaProxima] = useState<Tarea | null>(null);
  const [materiasActuales, setMateriasActuales] = useState<{ id_matricula: string; id_materia: string; nombre: string; creditos: number; nota: number | null }[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const cargar = async () => {
      setError('');
      try {
        if (rol === 'Estudiante' && cedula) {
          const [tareas, notas, estudiantes] = await Promise.all([
            getAuth<Tarea[]>('/tareas/'),
            getAuth<Nota[]>('/notas/'),
            get<Estudiante[]>('/estudiantes/'),
          ]);
          const est = estudiantes.find((e) => e.id_estudiante === cedula);
          if (est) setNombre(`${est.nombre} ${est.apellidos}`);
          const pendientes = tareas.filter((t) => t.estado_entrega === 'Pendiente');
          const entregadas = tareas.filter((t) => t.estado_entrega === 'Entregado');
          const conDef = notas.filter((n) => n.definitiva != null);
          const promedio = conDef.length
            ? conDef.reduce((s, n) => s + Number(n.definitiva), 0) / conDef.length
            : null;
          // Tarea mas cercana a vencer
          const pendientesOrdenadas = pendientes
            .slice()
            .sort((a, b) => new Date(a.fecha_limite).getTime() - new Date(b.fecha_limite).getTime());
          setTareaProxima(pendientesOrdenadas[0] || null);
          // Cargar materias actuales del periodo vigente
          const matriculas = await getAuth<Matricula[]>('/matriculas/');
          const todasMaterias = await get<Materia[]>('/materias/');
          const porIdMateria = new Map(todasMaterias.map((m) => [m.id_materia, m]));
          const materiasInfo = matriculas
            .filter((m) => m.estado === 'Activa')
            .map((m) => {
              const mat = porIdMateria.get(m.id_materia);
              const nota = notas.find((n) => n.id_matricula === m.id_matricula);
              return {
                id_matricula: m.id_matricula,
                id_materia: m.id_materia,
                nombre: mat?.nombre_curso || m.id_materia,
                creditos: m.creditos,
                nota: nota?.definitiva != null ? Number(nota.definitiva) : null,
              };
            });
          setMateriasActuales(materiasInfo);
          setStats({
            tareas: tareas.length, pendientes: pendientes.length,
            entregadas: entregadas.length, notas: notas.length,
            promedio, materias: 0, estudiantes: 0, periodos: 0,
          });
        } else if (rol === 'Profesor') {
          const [tareas, materias] = await Promise.all([
            getAuth<Tarea[]>('/tareas/'),
            get<Materia[]>('/materias/'),
          ]);
          const mias = materias.filter((m) => m.id_profesor === cedula);
          const entregas = tareas.reduce((s, t) => s + (t.entregas_recibidas ?? 0), 0);
          const pendientes = tareas.reduce((s, t) => s + (t.matriculados ?? 0), 0);
          setStats({
            tareas: tareas.length, pendientes: entregas,
            entregadas: pendientes, notas: 0, promedio: null,
            materias: mias.length, estudiantes: 0, periodos: 0,
          });
        } else {
          const [materias, estudiantes, periodos, profesores] = await Promise.all([
            get<Materia[]>('/materias/'),
            get<Estudiante[]>('/estudiantes/'),
            get<Periodo[]>('/periodos/'),
            get<unknown[]>('/profesores/'),
          ]);
          setStats({
            tareas: materias.length, pendientes: estudiantes.length,
            entregadas: profesores.length, notas: periodos.length,
            promedio: null, materias: materias.length,
            estudiantes: estudiantes.length, periodos: periodos.length,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los datos.');
      }
    };
    cargar();
  }, [rol, cedula]);

  if (error) {
    return (
      <div className="stat-grid">
        <div className="stat-card" style={{ gridColumn: '1/-1' }}>
          <p style={{ color: 'var(--danger)' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="stat-grid">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="stat-card skeleton" style={{ minHeight: 140 }} />
        ))}
      </div>
    );
  }

  // Calcular porcentaje para barras de progreso
  const pctEntregadas = stats.tareas > 0 ? Math.round((stats.entregadas / stats.tareas) * 100) : 0;
  const pctPromedio = stats.promedio != null ? Math.round((stats.promedio / 5) * 100) : 0;

  return (
    <>
      {/* Banner de bienvenida */}
      <div className="welcome-banner">
        <div>
          <h2 className="section-title">
            {rol === 'Estudiante' && (nombre || `Bienvenido, ${cedula}`)}
            {rol === 'Profesor' && 'Panel del docente'}
            {rol === 'Administrador' && 'Panel de administración'}
          </h2>
          <p className="section-sub" style={{ marginTop: 4 }}>
            {rol === 'Estudiante' && 'Tu actividad académica al día.'}
            {rol === 'Profesor' && `${stats.materias || 0} materias asignadas · ${stats.tareas} tareas publicadas.`}
            {rol === 'Administrador' && `${stats.estudiantes} estudiantes · ${stats.materias} materias · ${stats.periodos} periodos.`}
          </p>
        </div>
        {rol === 'Estudiante' && stats.promedio != null && (
          <div className="welcome-badge">
            <span className="welcome-badge-value">{stats.promedio.toFixed(2)}</span>
            <span className="welcome-badge-label">Promedio</span>
          </div>
        )}
      </div>

      {/* Tarjetas de estadisticas con barras */}
      <div className="stat-grid">
        {rol === 'Estudiante' && (
          <>
            <div className="stat-card">
              <span className="stat-label">Mis tareas</span>
              <span className="stat-value">{stats.tareas}</span>
              <div className="stat-bar">
                <div className="stat-bar-fill" style={{ width: `${pctEntregadas}%`, background: 'var(--success)' }} />
              </div>
              <span className="section-sub">{stats.entregadas} entregadas · {stats.pendientes} pendientes</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Materias con nota</span>
              <span className="stat-value">{stats.notas}</span>
              <span className="section-sub">Registradas por tus profesores</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Promedio de definitivas</span>
              <span className="stat-value" style={{ color: (stats.promedio ?? 0) >= 3 ? 'var(--success)' : 'var(--danger)' }}>
                {stats.promedio != null ? stats.promedio.toFixed(2) : '—'}
              </span>
              <div className="stat-bar">
                <div
                  className="stat-bar-fill"
                  style={{
                    width: `${pctPromedio}%`,
                    background: (stats.promedio ?? 0) >= 3 ? 'var(--success)' : 'var(--danger)',
                  }}
                />
              </div>
              <span className="section-sub">Aprobado desde 3.0</span>
            </div>
          </>
        )}
        {rol === 'Profesor' && (
          <>
            <div className="stat-card">
              <span className="stat-label">Tareas creadas</span>
              <span className="stat-value">{stats.tareas}</span>
              <span className="section-sub">En tus {stats.materias} materias</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Entregas recibidas</span>
              <span className="stat-value">{stats.pendientes}</span>
              <span className="section-sub">De {stats.entregadas} matriculados</span>
            </div>
          </>
        )}
        {rol === 'Administrador' && (
          <>
            <div className="stat-card">
              <span className="stat-label">Materias</span>
              <span className="stat-value">{stats.materias}</span>
              <span className="section-sub">En el catálogo</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Estudiantes</span>
              <span className="stat-value">{stats.estudiantes}</span>
              <span className="section-sub">Registrados</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Periodos</span>
              <span className="stat-value">{stats.periodos}</span>
              <span className="section-sub">Ventanas de matrícula</span>
            </div>
          </>
        )}
      </div>

      {/* Tarea proxima (estudiante) */}
      {rol === 'Estudiante' && tareaProxima && (
        <div className="stat-card" style={{ borderLeft: '3px solid var(--warning)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="stat-label" style={{ color: 'var(--warning)' }}>Próxima entrega</span>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{tareaProxima.titulo}</div>
              <div className="section-sub" style={{ marginTop: 2 }}>
                {tareaProxima.materia} · Límite: {formatoFecha(tareaProxima.fecha_limite)}
              </div>
            </div>
            <span className="chip">{tareaProxima.tipo}</span>
          </div>
        </div>
      )}

      {/* Materias actuales del estudiante */}
      {rol === 'Estudiante' && (
        <div>
          <h3 className="section-title" style={{ fontSize: 16 }}>Mis materias del periodo</h3>
          <div className="materias-grid">
            {materiasActuales.map((m) => (
              <div key={m.id_matricula} className="stat-card materia-mini">
                <div className="materia-mini-top">
                  <span className="chip teal">{m.id_materia}</span>
                  <span className="section-sub">{m.creditos} créditos</span>
                </div>
                <div className="materia-mini-nombre">{m.nombre}</div>
                <div className="materia-mini-footer">
                  <span className={`materia-nota ${(m.nota ?? 0) >= 3 || m.nota == null ? '' : 'reprobada'}`}>
                    {m.nota != null ? m.nota.toFixed(1) : '—'}
                  </span>
                  <span className={`chip ${m.nota == null ? '' : m.nota >= 3 ? 'green' : 'red'}`}>
                    {m.nota == null ? 'Sin nota' : m.nota >= 3 ? 'Aprobado' : 'Reprobado'}
                  </span>
                </div>
              </div>
            ))}
            {materiasActuales.length === 0 && (
              <div className="stat-card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40 }}>
                <span className="section-sub">No tienes materias matriculadas en el periodo actual.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Acciones rapidas */}
      <div>
        <h3 className="section-title" style={{ fontSize: 16 }}>Acciones rápidas</h3>
        <div className="acciones-grid">
          {rol === 'Estudiante' && (
            <>
              <button className="accion-card" onClick={() => onNavegar?.('matricular')}>
                <span className="accion-icon">✓</span>
                <span className="accion-texto">Matricular</span>
                <span className="accion-sub">Arma tu horario</span>
              </button>
              <button className="accion-card" onClick={() => onNavegar?.('registro')}>
                <span className="accion-icon">◫</span>
                <span className="accion-texto">Registro académico</span>
                <span className="accion-sub">Promedios y notas</span>
              </button>
              <button className="accion-card" onClick={() => onNavegar?.('mistareas')}>
                <span className="accion-icon">❑</span>
                <span className="accion-texto">Mis tareas</span>
                <span className="accion-sub">Entregas pendientes</span>
              </button>
              <button className="accion-card" onClick={() => onNavegar?.('docs')}>
                <span className="accion-icon">⇩</span>
                <span className="accion-texto">Documentos</span>
                <span className="accion-sub">Recibo y boletín PDF</span>
              </button>
            </>
          )}
          {rol === 'Profesor' && (
            <>
              <button className="accion-card" onClick={() => onNavegar?.('ingresarnotas')}>
                <span className="accion-icon">✎</span>
                <span className="accion-texto">Ingresar notas</span>
                <span className="accion-sub">Califica a tus estudiantes</span>
              </button>
              <button className="accion-card" onClick={() => onNavegar?.('tareas')}>
                <span className="accion-icon">❑</span>
                <span className="accion-texto">Tareas</span>
                <span className="accion-sub">Crear y revisar</span>
              </button>
              <button className="accion-card" onClick={() => onNavegar?.('reportes')}>
                <span className="accion-icon">⇩</span>
                <span className="accion-texto">Reportes</span>
                <span className="accion-sub">PDF de tus estudiantes</span>
              </button>
            </>
          )}
          {rol === 'Administrador' && (
            <>
              <button className="accion-card" onClick={() => onNavegar?.('periodos')}>
                <span className="accion-icon">⏱</span>
                <span className="accion-texto">Periodos</span>
                <span className="accion-sub">Ventanas de matrícula</span>
              </button>
              <button className="accion-card" onClick={() => onNavegar?.('materias')}>
                <span className="accion-icon">▥</span>
                <span className="accion-texto">Materias</span>
                <span className="accion-sub">Catálogo completo</span>
              </button>
              <button className="accion-card" onClick={() => onNavegar?.('cuentas')}>
                <span className="accion-icon">👤</span>
                <span className="accion-texto">Cuentas</span>
                <span className="accion-sub">Crear y restablecer</span>
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
