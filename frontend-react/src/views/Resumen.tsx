import { useEffect, useState } from 'react';
import { getAuth } from '../api/client';
import type { Rol, Nota, Tarea } from '../api/types';

interface ResumenProps {
  rol: Rol;
  cedula: string | null;
}

interface Stats {
  tareas: number;
  pendientes: number;
  notas: number;
  promedio: string;
}

export default function Resumen({ rol, cedula }: ResumenProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const cargar = async () => {
      setError('');
      try {
        if (rol === 'Estudiante') {
          const [tareas, notas] = await Promise.all([
            getAuth<Tarea[]>('/tareas/'),
            getAuth<Nota[]>('/notas/'),
          ]);
          const pendientes = tareas.filter((t) => t.estado_entrega === 'Pendiente').length;
          const conDefinitiva = notas.filter((n) => n.definitiva != null);
          const promedio = conDefinitiva.length
            ? (conDefinitiva.reduce((s, n) => s + Number(n.definitiva), 0) / conDefinitiva.length).toFixed(2)
            : '—';
          setStats({ tareas: tareas.length, pendientes, notas: notas.length, promedio });
        } else if (rol === 'Profesor') {
          const tareas = await getAuth<Tarea[]>('/tareas/');
          const entregas = tareas.reduce((s, t) => s + (t.entregas_recibidas ?? 0), 0);
          setStats({ tareas: tareas.length, pendientes: entregas, notas: 0, promedio: '—' });
        } else {
          // Admin: conteo de catalogos publicos
          const [materias, estudiantes, periodos] = await Promise.all([
            getAuth<unknown[]>('/materias/'),
            getAuth<unknown[]>('/estudiantes/'),
            getAuth<unknown[]>('/periodos/'),
          ]);
          setStats({
            tareas: materias.length,
            pendientes: estudiantes.length,
            notas: periodos.length,
            promedio: '—',
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
        <div className="stat-card">
          <p className="recover-sub" style={{ color: 'var(--danger)' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="stat-grid">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="stat-card" style={{ minHeight: 120 }}>
            <span className="stat-label">Cargando…</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div>
        <h2 className="section-title">Resumen académico</h2>
        <p className="section-sub">
          {rol === 'Estudiante' && 'Tu actividad académica en un vistazo.'}
          {rol === 'Profesor' && 'Tus materias, tareas y entregas.'}
          {rol === 'Administrador' && 'Totales de los catálogos del sistema.'}
        </p>
      </div>

      <div className="stat-grid">
        {rol === 'Estudiante' && (
          <>
            <div className="stat-card">
              <span className="stat-label">Mis tareas</span>
              <span className="stat-value">{stats.tareas}</span>
              <span className="section-sub">{stats.pendientes} pendientes de entrega</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Materias con nota</span>
              <span className="stat-value">{stats.notas}</span>
              <span className="section-sub">Registradas por tus profesores</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Promedio de definitivas</span>
              <span className="stat-value" style={{ color: Number(stats.promedio) >= 3 ? 'var(--success)' : 'var(--danger)' }}>
                {stats.promedio}
              </span>
              <span className="section-sub">Aprobado desde 3.0</span>
            </div>
          </>
        )}
        {rol === 'Profesor' && (
          <>
            <div className="stat-card">
              <span className="stat-label">Tareas creadas</span>
              <span className="stat-value">{stats.tareas}</span>
              <span className="section-sub">En tus materias</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Entregas recibidas</span>
              <span className="stat-value">{stats.pendientes}</span>
              <span className="section-sub">De todos tus estudiantes</span>
            </div>
          </>
        )}
        {rol === 'Administrador' && (
          <>
            <div className="stat-card">
              <span className="stat-label">Materias</span>
              <span className="stat-value">{stats.tareas}</span>
              <span className="section-sub">En el catálogo</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Estudiantes</span>
              <span className="stat-value">{stats.pendientes}</span>
              <span className="section-sub">Registrados</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Periodos</span>
              <span className="stat-value">{stats.notas}</span>
              <span className="section-sub">Ventanas de matrícula</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
